import { useEffect, useRef, useState } from 'react';
import { circleMarker, map, tileLayer } from 'leaflet';
import type { CircleMarker, Map as LeafletMap } from 'leaflet';
import { MapPin } from 'lucide-react';
import type { LocationPoint } from '@/types/location';
import 'leaflet/dist/leaflet.css';

export function LocationMap({ point, eager = false }: { point: LocationPoint; eager?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<CircleMarker>(null);
  const activeMap = useRef<LeafletMap>(null);
  const latest = useRef(point);
  const [visible, setVisible] = useState(eager);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element || eager) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '80px',
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    latest.current = point;
    const position = marker.current?.setLatLng([point.latitude, point.longitude]).getLatLng();
    const instance = activeMap.current;
    if (position && instance && !instance.getBounds().pad(-0.25).contains(position)) {
      instance.panTo(position, { animate: false });
    }
  }, [point]);

  useEffect(() => {
    const element = container.current;
    if (!visible || !element) return;
    const initial = latest.current;
    const instance = map(element, {
      attributionControl: true,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    }).setView([initial.latitude, initial.longitude], 16);
    instance.attributionControl.setPrefix(false);
    const tiles = tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    });
    tiles.on('tileload', () => {
      setLoaded(true);
      setUnavailable(false);
    });
    tiles.on('tileerror', () => setUnavailable(true));
    tiles.addTo(instance);
    const pin = circleMarker([initial.latitude, initial.longitude], {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#2563eb',
      fillOpacity: 1,
      interactive: false,
    }).addTo(instance);
    activeMap.current = instance;
    marker.current = pin;
    const resize = new ResizeObserver(() => instance.invalidateSize({ animate: false }));
    resize.observe(element);

    return () => {
      resize.disconnect();
      marker.current = null;
      activeMap.current = null;
      instance.remove();
    };
  }, [visible]);

  return (
    <div className='relative h-36 w-full overflow-hidden rounded-lg bg-bg-app'>
      <div
        ref={container}
        className='h-full w-full [&_.leaflet-control-attribution]:text-[11px]'
        aria-label='Mapa de la ubicación'
      />
      {!loaded && (
        <div className='pointer-events-none absolute inset-0 z-[500] grid place-content-center justify-items-center gap-1 bg-bg-app text-xs text-text-secondary'>
          <MapPin size={20} aria-hidden='true' />
          {unavailable ? 'Mapa no disponible' : 'Vista del mapa'}
        </div>
      )}
    </div>
  );
}
