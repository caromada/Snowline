import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <section className={s.doc}>
      <div className={s.wrap}>
        <article>
          <h1 className={`${s.display} ${s.h2}`}>Terms of use</h1>
          <p className={s.draftBanner}>
            Draft for legal review. These terms have not yet been reviewed by an attorney and will
            be finalized before any paid features launch.
          </p>
          <h2>What this is</h2>
          <p>
            {brand.name} is an informational planning aid. It gathers public sensor data,
            satellite-derived estimates and trip reports, and summarizes them for mountain passes.
            It is not a safety device, a forecast service, an avalanche forecast, or a substitute
            for your own judgment, training and equipment.
          </p>
          <h2>Your responsibility</h2>
          <p>
            Travel in the mountains is dangerous. Snow, ice, moving water, rockfall, fire, weather
            and avalanches can injure or kill. You alone decide whether to travel, and you accept
            the risks of doing so. Check official sources, including land managers, the National
            Weather Service and your regional avalanche center, before and during every trip.
          </p>
          <h2>No warranty</h2>
          <p>
            Data is provided as is and as available. It may be late, incomplete, estimated or
            wrong. Sensors fail, satellites are blocked by clouds, and trip reports reflect one
            party on one day. Conditions shown may not match conditions on the ground.
          </p>
          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, {brand.name} and its makers are not liable for
            any injury, loss or damage arising from use of, or reliance on, the service. Where
            liability cannot be excluded, it is limited to the amount you paid for the service in
            the twelve months before the claim, if anything.
          </p>
          <h2>Third-party data</h2>
          <p>
            Data comes from public agencies and open projects, credited on the credits page. Their
            terms apply to their data. Official information such as avalanche ratings or closures
            is shown as issued, with a link to the source, which controls if there is any
            difference.
          </p>
          <h2>Changes</h2>
          <p>We may update these terms. Continued use after an update means you accept it.</p>
        </article>
      </div>
    </section>
  );
}
