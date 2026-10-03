/* Default "master list" — seeds the editable knowledge in Settings on first run.
   Seeded from the shorthand actually used in HD39 DPR Sept 2026. Anything marked "?" is a term
   the crew uses whose meaning Mike still needs to fill in — the model is told "?" means unknown.
   This file is PUBLIC (GitHub Pages) — no client, field or personnel names here; add those in
   Settings on the phone, where they stay on the device. */
(function (root) {
  'use strict';

  const ROVS = ['HD39', 'HD55'];

  const KNOWLEDGE = {
    abbrev:
`# KEEP as abbreviations — equipment, systems and documents.
TMS = Tether Management System
ROV = remotely operated vehicle
LARS = launch and recovery system
MDF = mattress deployment frame
MRU = motion reference unit
HIPAP = HiPAP acoustic positioning
CP = cathodic protection
HSE = health, safety & environment
TRA = task risk assessment
TBT = toolbox talk
LOTO = lockout / tagout
GVI = general visual inspection
OCM = offshore construction manager
IMF = ?
QD = ?

# WRITE OUT in full — operational shorthand.
VM = vessel move
AFI = awaiting further instructions
RTS = return to surface
WOW = waiting on weather
SOZ = safe operating zone
TDP = touchdown point
GL = green light (to release)
HDG = heading
STBD = starboard
FWD = forward
MSW = metres of sea water ("12 MSW" → "12 m water depth")
w/ = with
chk = check
@ = at`,

    field:
`# Field, structure & item IDs — copy IDs exactly in the form shown here.
MDF = mattress deployment frame (handwriting may say MFD / FMD — always write MDF)
LBW-01 … LBW-11 = lift bags (check: pick one style — LBW-05 or LBW05)
LBW05A = lift bag 5A
GB-01 … GB-10 = grout bags (check: GB-01 or GB01)
FOC-xx / SFOC xx = mattress IDs (e.g. FOC-20, SFOC 24)
SP01 … SP03 = ?
Carousel = air-hose carousel (subsea basket)
Seabird = ?`,

    rov:
`# General ROV operations knowledge
Dive sequence: pre-dive checks → "Dive" (launch) → TMS all-stop at depth → ROV exits TMS → work → ROV docks in TMS → "Location" (system on deck) → post-dive checks.
"Dive" and "Location" are single-word marker lines in the DPR — keep them exactly as one word.
Vessel moves are logged as a vessel move commencing, then "Vessel move complete."
Shift change happens at 11:45 / 23:45 after a pre-shift meeting at 11:30 / 23:30.
The day opens "Begin this day …" at 00:00 and closes "End this day …" at 24:00.`,

    ops:
`# Operation playbooks — the critical points of each operation, in order.
# Write each step's line in this wording. {ID} = the asset's ID, {ROV} = the ROV for the page.
# Add a playbook for any operation you run: a "## name — asset: …" line, then numbered steps.

## Mattress installation — asset: mattress ID (e.g. F21, B4)
1. Crane off deck with mattress {ID}.
2. Visual inspection of mattress {ID} and rigging check complete.
3. Vessel in position; begin installation of mattress {ID}.
4. Mattress {ID} landed; green light given to release.
5. Mattress {ID} released.
6. {ROV} in the safe operating zone for crane recovery.
7. Crane on deck.`,

    tooling:
`# General ROV tooling
manipulator (5-function / 7-function arm)
torque tool, hot stab, cutter, wire-rope cutter
air hose / air nozzle (for filling lift bags)
CP probe
rigging, slings, shackles, crane hook
T4 filter = ?`,
  };

  // House style = "C: full formal" (Mike, 2026-10-02): complete sentences, ";" between events,
  // "at" not "@", units spaced (10 m), shorthand written out, equipment names kept (TMS, ROV, MDF).
  // Each line is a formal rewrite of a real line from the master book — same facts, nothing added.
  const STYLE_EXAMPLES = [
    'Begin this day with HD39 on deck; vessel on location.',
    "Crew reviewed HSE paperwork for the day's planned tasks.",
    'Pre-dive checks completed; all systems confirmed good.',
    'Dive',
    'HD39 TMS all-stop at 10 m depth.',
    'HD39 exited the TMS and is heading to lift bag LBW-07.',
    'HD39 removed lift bag LBW-07 from the pipeline; the bag will not hold air.',
    'HD39 installed lift bag LBW-07 in the basket; 100% tied off.',
    'Vessel move complete; HD39 heading to lift bag LBW-10.',
    'Crane at 15 m depth.',
    'HD39 disconnected the crane from the carousel; crane clear to deck.',
    'Photographs taken of the LBW-09 and LBW-10 leak points.',
    'HD39 docked in the TMS and returning to surface due to incoming weather.',
    'Location',
    'Post-dive checks completed.',
    'Oncoming shift attended the pre-shift meeting.',
    'Shift change and handover.',
    'End this day with the ROV on deck; vessel at anchorage.',
  ];

  // Previous starter text (seed v1). A section still exactly equal to this was never edited,
  // so the app swaps it for the new default; edited sections are left alone.
  const LEGACY_KNOWLEDGE = {
    abbrev:
`# Standard DPR abbreviations — keep these AS abbreviations in the DPR.
TMS = Tether Management System
VM = vessel move
SOZ = safe operating zone
GVI = general visual inspection
AFI = awaiting further instructions
RTS = return to surface
HSE = health, safety & environment
TRA = task risk assessment
TBT = toolbox talk
OCM = offshore construction manager
MSW = metres of sea water (depth)
HDG = heading
WOW = waiting on weather
TDP = touchdown point
STBD = starboard
FWD = forward
LOTO = lockout / tagout
LARS = launch and recovery system
MRU = motion reference unit
HIPAP = HiPAP acoustic positioning
IMF = ?
QD = ?

# Personal shorthand — write these OUT in full.
w/ = with
chk = check
@ = at (keep "@" before a depth or time, e.g. "@ 10m")`,

    rov:
`# General ROV operations knowledge
Dive sequence: pre-dive checks → "Dive" (launch) → TMS all-stop @ depth → ROV out of TMS → work → ROV in TMS → "Location" (system on deck) → post-dive checks.
"Dive" and "Location" are single-word marker lines in the DPR — keep them exactly as one word.
Vessel moves are logged as "VM to …" then "VM complete."
Shift change happens at 11:45 / 23:45 after a pre-shift meeting at 11:30 / 23:30.
The day opens "Begin this day, …" at 00:00 and closes "End this day, …" at 24:00.`,

  };
  const SEED_VERSION = 3;   // v3 added the operation playbooks section

  root.KB = { ROVS, KNOWLEDGE, STYLE_EXAMPLES, LEGACY_KNOWLEDGE, SEED_VERSION };
})(typeof self !== 'undefined' ? self : this);
