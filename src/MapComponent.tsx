import React, {useEffect, useRef, useState} from 'react';
import maplibregl, {LngLatLike} from 'maplibre-gl';
import {MaplibreTerradrawControl} from '@watergis/maplibre-gl-terradraw';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
import './style.css';

const MAPTILER_KEY = 'nHTWvUmDNVV9wDQkOGbe'

interface iSearchResult {
    bbox: number[]
    center: [number, number]
    context: {}[]
    geometry: { type: string, coordinates: [number, number] }
    id: string
    place_name: string
    place_name_en: string
    place_type: string[]
    place_type_name: string[]
    properties: { ref: string, country_code: string, place_type_name: string[] }
    relevance: number
    text: string
    text_en: string
    type: string
}

const MapComponent: React.FC = () => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [suggestions, setSuggestions] = useState<iSearchResult[]>([]);
    const [address, setAddress] = useState<string|iSearchResult>('');
    const draw = useRef<MapboxDraw | null>(null);
    const infoRef = useRef<HTMLPreElement>(null);
    const [sidebarState, setSidebarState] = useState({left: true, right: false});
    const [coordinateCenter, setCoordinateCenter] = useState<[
        number,
        number
    ]>([-105.02107858657837, 39.54237452801803])
    const addressInputRef = useRef<HTMLInputElement>(null);

    // 📌 Fetch autocomplete suggestions from Nominatim API
    // Fetch autocomplete suggestions
    const fetchSuggestions = async (input: string) => {
        if (input.length < 3) {
            setSuggestions([]);
            return;
        }

        const { lng, lat } = map.current!.getCenter();
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(input)}.json?autocomplete=true&proximity=${lng},${lat}&key=${MAPTILER_KEY}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            setSuggestions(data.features || []);
        } catch (error) {
            console.error("Error fetching address suggestions:", error);
        }
    };

    // 🔹 Reverse Geocode Function
    async function reverseGeocode(lat: number, lon: number) {
        const url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${MAPTILER_KEY}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            console.log("reverseGeocode", data)
            if (data.features.length > 0) {
                setSuggestions(data.features)
                setAddress(data.features[0])
            } else {
                return "No address found";
            }
        } catch (error) {
            console.error("Reverse Geocode Error:", error);
            return "Error fetching address";
        }
    }

    // 📌 Handle address input changes
    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAddress(value);
        fetchSuggestions(value);
    };

    // 📌 When user selects a suggestion
    const handleSelectSuggestion = (suggestion: iSearchResult) => {
        setAddress(suggestion);
        setSuggestions([]);
        const newCenter: LngLatLike = [suggestion.geometry.coordinates[0], suggestion.geometry.coordinates[1]];
        setCoordinateCenter(newCenter);
        map.current?.flyTo({center: newCenter, zoom: 14});
    };


    useEffect(() => {
        if (!map.current && mapContainer.current) {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: `https://api.maptiler.com/maps/basic-v2/style.json?key=${MAPTILER_KEY}`,
                center: coordinateCenter,
                zoom: 10,
                pitch: 45,
                bearing: 0,
                minZoom: 5,
                maxZoom: 20,
                attributionControl: true,
                interactive: true,
                dragRotate: true,
                touchZoomRotate: true,
                scrollZoom: true,
                doubleClickZoom: true,
                boxZoom: true,
                keyboard: true,
                fadeDuration: 300,
                antialias: true,
            });

            // Add geolocate control to the map.
            map.current.addControl(
                new maplibregl.GeolocateControl({
                    positionOptions: {
                        enableHighAccuracy: true
                    },
                    trackUserLocation: true
                })
            );

            map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

            map.current.on('mousemove', (e) => {
                if (infoRef.current) {
                    infoRef.current.innerHTML = `${JSON.stringify(e.point)}<br />${JSON.stringify(e.lngLat.wrap())}`;
                }
            });

            const draw = new MaplibreTerradrawControl({
                modes: [
                    // 'render', comment this to always show drawing tool
                    // 'point',
                    // 'linestring',
                    'polygon',
                    'rectangle',
                    'circle',
                    'freehand',
                    'angled-rectangle',
                    //'sensor',
                    'sector',
                    'select',
                    'delete-selection',
                    'delete',
                    'download'
                ],
                open: true,
            });

            map.current.addControl(draw, 'top-right');

            map.current!.on('load', () => {

                // Insert the layer beneath any symbol layer.
                const layers = map.current!.getStyle().layers;

                let labelLayerId;
                for (let i = 0; i < layers.length; i++) {

                    const layer = layers[i];

                    // Ensure the layer is a symbol and layout exists
                    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
                        labelLayerId = layer.id;
                        break;
                    }
                }

                map.current!.addSource('openmaptiles', {
                    url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
                    type: 'vector',
                });

                map.current!.addLayer(
                    {
                        'id': '3d-buildings',
                        'source': 'openmaptiles',
                        'source-layer': 'building',
                        'type': 'fill-extrusion',
                        'minzoom': 15,
                        'filter': ['!=', ['get', 'hide_3d'], true],
                        'paint': {
                            'fill-extrusion-color': [
                                'interpolate',
                                ['linear'],
                                ['get', 'render_height'], 0, 'lightgray', 200, 'royalblue', 400, 'lightblue'
                            ],
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                16,
                                ['get', 'render_height']
                            ],
                            'fill-extrusion-base': ['case',
                                ['>=', ['get', 'zoom'], 16],
                                ['get', 'render_min_height'], 0
                            ]
                        }
                    },
                    labelLayerId
                );

                // specific selection
                map.current!.addSource('national-park', {
                    'type': 'geojson',
                    'data': {
                        'type': 'FeatureCollection',
                        'features': [
                            {
                                'type': 'Feature',
                                'geometry': {
                                    'type': 'Polygon',
                                    'coordinates': [
                                        [
                                            [-121.353637, 40.584978],
                                            [-121.284551, 40.584758],
                                            [-121.275349, 40.541646],
                                            [-121.246768, 40.541017],
                                            [-121.251343, 40.423383],
                                            [-121.32687, 40.423768],
                                            [-121.360619, 40.43479],
                                            [-121.363694, 40.409124],
                                            [-121.439713, 40.409197],
                                            [-121.439711, 40.423791],
                                            [-121.572133, 40.423548],
                                            [-121.577415, 40.550766],
                                            [-121.539486, 40.558107],
                                            [-121.520284, 40.572459],
                                            [-121.487219, 40.550822],
                                            [-121.446951, 40.56319],
                                            [-121.370644, 40.563267],
                                            [-121.353637, 40.584978]
                                        ]
                                    ]
                                }
                            },
                            {
                                'type': 'Feature',
                                'geometry': {
                                    'type': 'Point',
                                    'coordinates': [-121.415061, 40.506229]
                                }
                            },
                            {
                                'type': 'Feature',
                                'geometry': {
                                    'type': 'Point',
                                    'coordinates': [-121.505184, 40.488084]
                                }
                            },
                            {
                                'type': 'Feature',
                                'geometry': {
                                    'type': 'Point',
                                    'coordinates': [-121.354465, 40.488737]
                                }
                            }
                        ]
                    }
                });

                map.current!.addLayer({
                    'id': 'park-boundary',
                    'type': 'fill',
                    'source': 'national-park',
                    'paint': {
                        'fill-color': '#888888',
                        'fill-opacity': 0.4
                    },
                    'filter': ['==', '$type', 'Polygon']
                });

                map.current!.addLayer({
                    'id': 'park-volcanoes',
                    'type': 'circle',
                    'source': 'national-park',
                    'paint': {
                        'circle-radius': 6,
                        'circle-color': '#B42222'
                    },
                    'filter': ['==', '$type', 'Point']
                });

                map.current!.on("click", async (e) => {
                    const {lng, lat} = e.lngLat;
                    console.log("Clicked coordinates:", lat, lng);
                    await reverseGeocode(lat, lng);
                });

                const properties: {
                    id: number,
                    coordinates: LngLatLike,
                    price: string
                }[] = [
                    {id: 1, coordinates: [-121.42, 40.49], price: "$450K"},
                    {id: 2, coordinates: [-121.45, 40.50], price: "$325K"},
                    {id: 3, coordinates: [-121.46, 40.47], price: "$500K"},
                ];

                // Add markers for each property
                properties.forEach((property) => {
                    const el = document.createElement('div');
                    el.className = 'marker';
                    el.innerHTML = `<span>${property.price}</span>`;

                    new maplibregl.Marker(el)
                        .setLngLat(property.coordinates)
                        .addTo(map.current!);
                });

            });


        }

        return () => {
            if (map.current) map.current.remove();
        };
    }, []);

    const toggleSidebar = (id: 'left' | 'right') => {
        setSidebarState((prevState) => {
            const newState = {...prevState, [id]: !prevState[id]};
            if (map.current) {
                const padding = {left: newState.left ? 300 : 0, right: newState.right ? 300 : 0};
                map.current.easeTo({padding, duration: 1000});
            }
            return newState;
        });
    };

    return (
        <>
            <div ref={mapContainer} style={{width: '100%', height: '100vh'}}>
                <div id="left" className={`sidebar flex-center left ${sidebarState.left ? '' : 'collapsed'}`}>
                    <div className="sidebar-content rounded-rect flex-center">
                        {/* 📌 Address Search Box with Autocomplete */}
                        <div style={{
                            position: 'absolute',
                            top: '10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#fff',
                            padding: '10px',
                            borderRadius: '5px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}>
                            <input
                                type="text"
                                value={typeof address === "string" ? address : address.place_name_en}
                                onChange={handleAddressChange}
                                placeholder="Enter address"
                                style={{
                                    width: '20vw',
                                    padding: '5px'
                            }}
                            />
                            <div style={{
                                zIndex: 10,
                                width: '20vw',
                                margin: '5px',
                                maxHeight: '75vh',
                                overflowY: 'auto',
                                background: '#fff',
                                borderRadius: '5px',
                                position: 'absolute',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}>
                                {suggestions.map((suggestion, index) => (
                                    <div
                                        key={index}
                                        onClick={() => handleSelectSuggestion(suggestion)}
                                        style={{padding: '5px', cursor: 'pointer', borderBottom: '1px solid #ddd'}}
                                    >
                                        {suggestion.place_name_en}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <pre style={{overflowY: 'scroll', height:"100%", top: "20vh"}} onClick={() => setSuggestions([])}>
                        {typeof address === "string" ? address : JSON.stringify(address, undefined, 4)}
                        </pre>
                        <div
                            className="sidebar-toggle rounded-rect left"
                            onClick={() => toggleSidebar('left')}
                        >
                            {sidebarState.left ? '←' : '→'}
                        </div>
                    </div>

                </div>
                <div id="right" className={`sidebar flex-center right ${sidebarState.right ? '' : 'collapsed'}`}>
                    <div className="sidebar-content rounded-rect flex-center">
                        Right Sidebar
                        <div
                            className="sidebar-toggle rounded-rect right"
                            onClick={() => toggleSidebar('right')}
                        >
                            {sidebarState.right ? '→' : '←'}
                        </div>
                    </div>
                </div>
            </div>
            <pre ref={infoRef} id="info">
            </pre>
        </>
    );
};

export default MapComponent;
