# Slim gateway official base

The slim gateway is maintained from the official New API release:

- Release: `v1.0.0-rc.25`
- Official commit: `f116414284162ad15d8925f7bca494c109b83e93`
- Release page: <https://github.com/QuantumNous/new-api/releases/tag/v1.0.0-rc.25>
- Local parent snapshot retained for the slim migration: `2d8e50bf36e94200b809dfb39e73624ec48b1e23`

The runtime `/api/status` field `source_base` exposes this lineage as
`official-v1.0.0-rc.25-f116414 (main-2d8e50bf)`. The release label is separate
from the upstream tag so that custom AIGC, payment, cache accounting and V1
channel-monitor changes remain distinguishable from upstream binaries.
