# Axon application-flow figures

Applies the user-supplied svg-animations and Anatomy guides. Their referenced kit,
examples and auditing scripts were not attached; this is a local React SVG
implementation, not a claim to use or pass the unavailable Anatomy tooling.

## Concept before geometry

A series of six bench instruments explains the same transaction:
identity cabinet → request terminal → signing press → simulation scanner →
admission switch → settlement recorder. These are illustrative metaphors, not
live contract readouts. The captions state the actual application behavior.

## Shared parts inventory

Base: four isolation feet, lower casting, upper plate, front inlay, four mounting
bolts, twenty-two calibrated ruler ticks. Structure and subject then vary:

- Cabinet: shell, cap, four drawers, four handles, four indicators, reader pedestal,
  reader, five contacts, switch socket, spindle and handle.
- Terminal: base, body, bezel, window, three field traces, keyboard tray,
  thirty-six keys, output pedestal, ticket and five encoded fields.
- Press: four guide posts, crown, ram, die, two frame plates, twelve contacts,
  lever mount, shaft and grip.
- Scanner: two rails, fourteen conveyor slats, two uprights, bridge, head,
  result instrument, window and six trace segments.
- Admission: two lanes, twenty-two guide marks, two barrier mounts, closed barrier,
  stake foundation, two gate posts, gate crown, three weights and three indicators.
- Recorder: enclosure, counter bezel, three counter wheels, three digit segments,
  receipt slot, paper, five printed rules, budget-meter base and eight segments.

## Rendering and motion

World x/y lie on the bench; z is height. One orthographic projection is shared
by every solid. Low casting, body and high surfaces have distinct top and side
shades. Cyan marks the mechanism being explained. Static geometry is computed
once. Base geometry is painted first, followed by parts in depth order.

Inline CSS animates only packet/stamp transforms and opacity. Motion runs only
when the stage is active and visible. Reduced motion is static.
Titles and descriptions remain available to assistive technology without animation. All surfaces support light mode.
