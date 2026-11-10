# Camera provider integration

Executable adapters currently live in `camera_providers.py` and share its `CameraProvider` base class. Each adapter must return published coordinates and actual public media URLs. `live_camera_record` normalizes the accepted feed types; it does not verify that a camera is live. `camera_health.py` separately probes catalog-owned media for inspected cameras.

`discovery.json` is an official-source research directory, not a camera database. Adding a state directory entry must never produce fabricated map markers or imply working camera coverage. Add an adapter only after checking its real catalog, coordinates, media format, access requirements and attribution. Never infer lens heading from highway direction. Credentials, if ever required, belong in server environment variables and GitHub Actions secrets, never this directory or the static Pages bundle.

Current feed types: `hls`, `mjpeg`, `snapshot`/`jpeg`, and curated public `embed`. Snapshot capture time is unknown unless the publisher supplies it. Health labels describe evidence, not an assumed real-time guarantee.
