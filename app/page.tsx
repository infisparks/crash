'use client';
import React, { useState, useEffect, useRef } from 'react';
// Import Firebase instances directly from your firebase.ts file
import { app, database } from '../lib/firebase'; // Adjusted path to ../lib/firebase as requested

import { ref, onValue, remove, set, get } from 'firebase/database';
// IMPORTANT: Dynamically import MapContainer and related components with ssr: false
import dynamic from 'next/dynamic';
// Removed direct import of L from 'leaflet' here
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Trash2, AlertTriangle, Navigation, LocateFixed, ArrowLeft, Map } from 'lucide-react';
import { Toaster, toast } from 'sonner';

// Add global styles for Leaflet popups to ensure readability
const globalLeafletStyles = `
  .custom-popup .leaflet-popup-content-wrapper {
    background-color: rgba(255, 255, 255, 0.9); /* Slightly transparent white background */
    color: #333; /* Dark text color */
    border-radius: 8px;
    padding: 10px;
    font-family: 'Inter', sans-serif; /* Ensure consistent font */
  }
  .custom-popup .leaflet-popup-content {
    margin: 0;
  }
  .custom-popup .leaflet-popup-tip {
    background-color: rgba(255, 255, 255, 0.9);
  }
`;

// Define the core data structure for a single location
interface LocationData {
  lat: number;
  long: number;
  timestamp: number;
}

// Define the props for the MapView component
interface MapViewProps {
  location: LocationData | null;
  onBack: () => void;
}

// A small component to handle map centering and view adjustments
// IMPORTANT: This component needs to be rendered only on the client.
const MapEvents = dynamic(() => import('react-leaflet').then(mod => {
  const { useMap } = mod;
  function MapEventsComponent({ location }: { location: MapViewProps['location'] }) {
    const map = useMap();
    useEffect(() => {
      if (location) {
        map.setView([location.lat, location.long], 13);
      }
    }, [location, map]);
    return null;
  }
  return MapEventsComponent;
}), { ssr: false });

// MapView component to display the location(s) on a map
// IMPORTANT: This component needs to be rendered only on the client.
const MapView = dynamic(() => import('react-leaflet').then(mod => {
  const { MapContainer, TileLayer, Marker, Popup } = mod;
  // Import L here, inside the dynamic import's scope
  const L = require('leaflet');

  // Create a custom icon for the map markers here
  const redIcon = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  // This is the actual MapView component content
  const MapViewComponent = ({ location, onBack }: MapViewProps) => {
    const initialPosition: [number, number] = location ? [location.lat, location.long] : [19.09719, 72.88258];
    const markerRef = useRef<L.Marker>(null); // Ref for the marker
    const prevLocationRef = useRef<LocationData | null>(null);

    useEffect(() => {
      if (location && markerRef.current) {
        const prevLocation = prevLocationRef.current;
        const coordsChanged = !prevLocation ||
                               location.lat !== prevLocation.lat ||
                               location.long !== prevLocation.long;

        if (coordsChanged) {
          markerRef.current.openPopup();
        }
        prevLocationRef.current = location;
      } else if (!location && prevLocationRef.current) {
        prevLocationRef.current = null;
      }
    }, [location]);

    return (
      <div className="relative w-full h-screen">
        <style>{globalLeafletStyles}</style>
        <MapContainer
          center={initialPosition}
          zoom={13}
          className="w-full h-full"
          style={{ height: '100vh', width: '100vw' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {location && (
            <Marker ref={markerRef} position={[location.lat, location.long]} icon={redIcon}>
              <Popup className="custom-popup">
                <div className="text-red-600 font-bold text-lg">🚨 NEW ACCIDENT OCCURRED!</div>
                <br/>
                Latitude: {location.lat.toFixed(6)}<br/>
                Longitude: {location.long.toFixed(6)}<br/>
                Last Update: {new Date(location.timestamp).toLocaleString()}
              </Popup>
            </Marker>
          )}
          <MapEvents location={location} />
        </MapContainer>
        <div className="absolute top-4 left-4 z-[1000]">
          <Button onClick={onBack} className="flex items-center gap-2 bg-slate-900/70 text-white hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </div>
      </div>
    );
  };
  return MapViewComponent;
}), { ssr: false });


export default function Home() {
  const [accidentLocation, setAccidentLocation] = useState<LocationData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [viewingMap, setViewingMap] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Subscribe to real-time database updates
  useEffect(() => {
    if (!database) return;

    const accidentLocationRef = ref(database, 'accedentlocation');

    const checkAndSetInitialData = async () => {
      try {
        const snapshot = await get(accidentLocationRef);
        // Only set initial dummy data if no data exists or if existing data is malformed
        const existingData = snapshot.val();
        if (!existingData || typeof existingData.lat !== 'string' || typeof existingData.long !== 'string' || typeof existingData.timestamp !== 'number') {
          await set(accidentLocationRef, {
            lat: "19.09719", // Set as string to match your Firebase data type
            long: "72.88258", // Set as string to match your Firebase data type
            timestamp: Date.now(),
          });
          console.log("Initial dummy accident location set or corrected.");
        }
      } catch (error) {
        console.error("Error checking or setting initial data:", error);
        toast.error('Data Init Error', {
          description: 'Failed to initialize data. Please check Firebase rules.',
        });
      } finally {
        setDataLoaded(true);
      }
    };

    // Ensure initial data check only happens once
    if (!dataLoaded) {
      checkAndSetInitialData();
    }

    const unsubscribe = onValue(
      accidentLocationRef,
      (snapshot) => {
        setIsConnected(true);
        const data = snapshot.val();

        // **CRITICAL FIX:** Validate and convert lat/long from string to number
        if (data && typeof data.lat === 'string' && typeof data.long === 'string' && typeof data.timestamp === 'number') {
          const numericLat = parseFloat(data.lat);
          const numericLong = parseFloat(data.long);

          if (!isNaN(numericLat) && !isNaN(numericLong)) {
            const processedData: LocationData = {
              lat: numericLat,
              long: numericLong,
              timestamp: data.timestamp,
            };

            // This toast logic still relies on timestamp change to avoid spamming toasts
            // for every minor data change if the timestamp isn't updated by the source.
            // The map popup will now trigger on lat/long change.
            if (accidentLocation?.timestamp !== processedData.timestamp) {
              toast.error('🚨 EMERGENCY ALERT', {
                description: `Incident detected at coordinates ${processedData.lat.toFixed(6)}, ${processedData.long.toFixed(6)}. Emergency responders dispatched immediately. Proceed with caution - situation requires urgent attention.`,
                duration: 8000,
                className: 'bg-red-50 border-red-200 text-red-900',
              });
            }
            setAccidentLocation(processedData);
          } else {
            console.warn("Received non-numeric lat/long strings for accident location:", data);
            setAccidentLocation(null); // Set to null if data is invalid after parsing
          }
        } else {
            // If data is null or not in the expected format (e.g., timestamp missing), set accidentLocation to null
            console.warn("Received malformed or null accident location data:", data);
            setAccidentLocation(null);
        }
      },
      (error) => {
        setIsConnected(false);
        toast.error('Connection Error', {
          description: 'Lost connection to emergency database. Attempting to reconnect...',
        });
        setAccidentLocation(null);
      }
    );

    return () => unsubscribe();
  }, [accidentLocation, dataLoaded]); // Keep dataLoaded in dependencies to ensure initial check runs

  const handleDeleteLocation = async () => {
    if (!database) return;
    try {
      await remove(ref(database, `accedentlocation`));
      toast.success('Location Cleared', {
        description: 'Emergency location data has been successfully removed from the system.',
      });
      setAccidentLocation(null);
    } catch (error) {
      toast.error('Delete Failed',
        { description: 'Unable to remove location data. Please try again.' }
      );
    }
  };

  // Function to open Google Maps
  const handleOpenGoogleMaps = () => {
    if (accidentLocation && typeof accidentLocation.lat === 'number' && typeof accidentLocation.long === 'number') {
      // Correct Google Maps URL format for coordinates
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${accidentLocation.lat},${accidentLocation.long}`;
      window.open(googleMapsUrl, '_blank');
    } else {
      toast.info('No Location', {
        description: 'There is no active accident location to show on Google Maps.',
      });
    }
  };

  if (viewingMap) {
    return <MapView location={accidentLocation} onBack={() => setViewingMap(false)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 font-[Inter]">
      <div className="max-w-6xl mx-auto space-y-6">
        <Toaster position="top-right" richColors /> {/* Toaster position moved to top-right as requested */}
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <h1 className="text-4xl font-bold text-white">Emergency Response Tracker</h1>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <div className="flex items-center justify-center gap-4">
            <Badge variant={isConnected ? 'default' : 'destructive'} className="text-sm px-3 py-1">
              {isConnected ? '🟢 SYSTEM ONLINE' : '🔴 SYSTEM OFFLINE'}
            </Badge>
            <Badge variant="outline" className="text-white border-white">
              Real-Time Monitoring Active
            </Badge>
          </div>
        </div>
        {/* Control Panel */}
        <Card className="bg-slate-800/50 border-slate-700 rounded-lg">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Navigation className="h-5 w-5 text-blue-400" />
              Control Center
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button
                onClick={() => setViewingMap(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                disabled={!accidentLocation}
              >
                <MapPin className="h-4 w-4 mr-2" />
                View Tactical Map
              </Button>
              <Button
                variant="outline"
                className="border-slate-600 text-white hover:bg-slate-700 rounded-lg"
                onClick={() => {
                  toast.info('System Status', {
                    description: accidentLocation ?
                      `Tracking 1 active location. All systems operational.` :
                      `No active locations. All systems operational.`
                  });
                }}
              >
                System Status
              </Button>
            </div>
          </CardContent>
        </Card>
        {/* Location Data Display */}
        {accidentLocation ? (
          <Card
            className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all duration-200 rounded-lg"
          >
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-red-500" />
                  Emergency Location
                </span>
                <Badge variant="destructive" className="text-xs rounded-full">
                  ACTIVE
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-900/50 p-3 rounded-lg">
                <div className="text-sm text-slate-400 mb-1">User</div>
                <div className="text-xl font-mono text-white">
                  Mudassir {/* Displaying the user's name */}
                </div>
              </div>
              <div className="space-y-3">
                <div className="bg-slate-900/50 p-3 rounded-lg">
                  <div className="text-sm text-slate-400 mb-1">Latitude</div>
                  <div className="text-xl font-mono text-white">
                    {/* Fixed: Now accidentLocation.lat is guaranteed to be a number if accidentLocation exists */}
                    {accidentLocation.lat.toFixed(6) || 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg">
                  <div className="text-sm text-slate-400 mb-1">Longitude</div>
                  <div className="text-xl font-mono text-white">
                    {/* Fixed: Now accidentLocation.long is guaranteed to be a number if accidentLocation exists */}
                    {accidentLocation.long.toFixed(6) || 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg">
                  <div className="text-sm text-slate-400 mb-1">Last Update</div>
                  <div className="text-sm text-white">
                    {accidentLocation.timestamp
                      ? new Date(accidentLocation.timestamp).toLocaleString()
                      : 'Unknown'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteLocation}
                  className="flex-1 rounded-lg"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Data
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-white border-green-500 hover:bg-slate-700 bg-blue-500 rounded-lg"
                  onClick={handleOpenGoogleMaps} // New button for Google Maps
                >
                  <Map className="h-4 w-4 mr-2 " />
                  Open in Google Maps
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-slate-800/50 border-slate-700 rounded-lg">
            <CardContent className="py-12 text-center">
              <MapPin className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">No active emergency locations detected</p>
              <p className="text-slate-500 text-sm mt-2">
                Monitoring system is active and ready for incidents
              </p>
            </CardContent>
          </Card>
        )}
        {/* Emergency Info */}
        <Card className="bg-red-900/20 border-red-800 rounded-lg">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Emergency Response Protocol
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-red-200 space-y-2">
              <p>• All location updates trigger automatic emergency notifications</p>
              <p>• Response teams are dispatched immediately upon incident detection</p>
              <p>• Use tactical map view for enhanced situational awareness</p>
              <p>• Clear location data only after incident resolution</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
