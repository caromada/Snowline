"use client";

import { directionsUrl } from "@/lib/directions";
import { boot, tent } from "@/lib/pixel";
import type { Access, Campground, Trailhead } from "@/lib/types";
import PixelGlyph from "./PixelGlyph";

const SURFACE: Record<string, string> = {
  asphalt: "paved",
  paved: "paved",
  concrete: "paved",
  gravel: "gravel",
  fine_gravel: "gravel",
  compacted: "gravel",
  unpaved: "unpaved",
  dirt: "dirt",
  ground: "dirt",
};

function gain(t: Trailhead): string | null {
  if (t.gain_ft === undefined) return null;
  const ft = Math.abs(t.gain_ft).toLocaleString();
  if (Math.abs(t.gain_ft) < 100) return "level with the pass";
  return t.gain_ft > 0 ? `${ft} ft below the pass` : `${ft} ft above the pass`;
}

function parking(t: Trailhead): string | null {
  if (!t.parking) return null;
  const bits = [
    t.parking.spaces ? `${t.parking.spaces} spaces` : null,
    t.parking.surface ? (SURFACE[t.parking.surface] ?? null) : null,
    t.parking.fee === true ? "fee" : t.parking.fee === false ? "no fee" : null,
  ].filter(Boolean);
  return bits.length ? `parking: ${bits.join(", ")}` : "parking at the trailhead";
}

function camp(c: Campground): string {
  const bits = [
    c.backcountry ? "backcountry" : null,
    c.reservation === "required"
      ? "reservation required"
      : c.reservation === "no"
        ? "first come, first served"
        : c.reservation
          ? "takes reservations"
          : null,
    c.sites ? `${c.sites} sites` : null,
    c.fee === true ? "fee" : c.fee === false ? "no fee" : null,
    c.elevation_ft ? `${c.elevation_ft.toLocaleString()} ft` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

function Row({
  name,
  lines,
  lat,
  lon,
  website,
  onShow,
}: {
  name: string;
  lines: (string | null)[];
  lat: number;
  lon: number;
  website?: string;
  onShow: (lat: number, lon: number) => void;
}) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return (
    <li className="access-row">
      <div style={{ minWidth: 0 }}>
        <button className="access-name" onClick={() => onShow(lat, lon)} title="show on the map">
          {name}
        </button>
        {lines.filter(Boolean).map((l) => (
          <div key={l} className="mono" style={{ color: "var(--sage)", marginTop: 2 }}>
            {l}
          </div>
        ))}
        {website && (
          <a className="mono access-link" href={website} target="_blank" rel="noreferrer">
            official page
          </a>
        )}
      </div>
      <a
        className="display access-go"
        href={directionsUrl(lat, lon, ua)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Driving directions to ${name}`}
      >
        Directions
      </a>
    </li>
  );
}

// How you get to the pass: the nearest trailheads with the parking beside
// them, and where to sleep. Distances are straight lines, and say so.
export default function GettingThere({
  access,
  onShow,
}: {
  access: Access;
  onShow: (lat: number, lon: number) => void;
}) {
  if (!access.trailheads.length && !access.campgrounds.length) return null;
  return (
    <section aria-label="Getting there" style={{ marginTop: 20 }}>
      {access.trailheads.length > 0 && (
        <>
          <h3 className="display access-head">
            <PixelGlyph sprite={boot} scale={1} title="" />
            Trailheads
          </h3>
          <ul className="access-list">
            {access.trailheads.map((t) => (
              <Row
                key={`${t.name}-${t.lat}`}
                name={t.name}
                lat={t.lat}
                lon={t.lon}
                website={t.website}
                onShow={onShow}
                lines={[
                  [`${t.distance_mi} mi away in a straight line`, gain(t)].filter(Boolean).join(" · "),
                  parking(t),
                ]}
              />
            ))}
          </ul>
        </>
      )}
      {access.campgrounds.length > 0 && (
        <>
          <h3 className="display access-head" style={{ marginTop: 16 }}>
            <PixelGlyph sprite={tent} scale={1} title="" />
            Camping nearby
          </h3>
          <ul className="access-list">
            {access.campgrounds.map((c) => (
              <Row
                key={`${c.name}-${c.lat}`}
                name={c.name}
                lat={c.lat}
                lon={c.lon}
                website={c.website}
                onShow={onShow}
                lines={[`${c.distance_mi} mi away in a straight line`, camp(c) || null]}
              />
            ))}
          </ul>
        </>
      )}
      <p className="mono" style={{ color: "var(--sage)", marginTop: 10 }}>
        Roads to high trailheads can be gated or under snow well after the trail melts out.
      </p>
    </section>
  );
}
