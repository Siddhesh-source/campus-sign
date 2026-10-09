#!/usr/bin/env bash
# Set the anchor peer for one org on the channel (runs inside fabric-tools).
# Cross-org gossip/discovery needs anchor peers so the gateway can collect
# endorsements from both orgs. Adapted from fabric-samples setAnchorPeer.sh.
#   anchor.sh <orgNumber> <peerPort>
set -euo pipefail
ORG=$1 PORT=$2 CHANNEL=${CHANNEL:-campussign}
MSP=Org${ORG}MSP
CA=/work/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem
T=$(mktemp -d)
cd "$T"
peer channel fetch config config_block.pb -o orderer.example.com:7050 -c "$CHANNEL" --tls --cafile "$CA" 2>/dev/null
configtxlator proto_decode --input config_block.pb --type common.Block --output config_block.json
jq '.data.data[0].payload.data.config' config_block.json > config.json
jq --arg msp "$MSP" --arg host "peer0.org${ORG}.example.com" --argjson port "$PORT" \
  '.channel_group.groups.Application.groups[$msp].values += {"AnchorPeers":{"mod_policy":"Admins","value":{"anchor_peers":[{"host":$host,"port":$port}]},"version":"0"}}' \
  config.json > modified_config.json
configtxlator proto_encode --input config.json --type common.Config --output config.pb
configtxlator proto_encode --input modified_config.json --type common.Config --output modified_config.pb
if ! configtxlator compute_update --channel_id "$CHANNEL" --original config.pb --updated modified_config.pb --output config_update.pb 2>/dev/null; then
  echo "anchor peer for $MSP already set"; exit 0
fi
configtxlator proto_decode --input config_update.pb --type common.ConfigUpdate --output config_update.json
jq -n --arg ch "$CHANNEL" --slurpfile u config_update.json \
  '{payload:{header:{channel_header:{channel_id:$ch,type:2}},data:{config_update:$u[0]}}}' > envelope.json
configtxlator proto_encode --input envelope.json --type common.Envelope --output anchors.tx
peer channel update -o orderer.example.com:7050 -c "$CHANNEL" -f anchors.tx --tls --cafile "$CA" 2>&1 | tail -1
