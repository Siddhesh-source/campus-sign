#!/usr/bin/env bash
# CampusSign local Fabric network. Every Fabric CLI step runs inside the
# hyperledger/fabric-tools image, so no host binaries are needed (works on
# Windows/Git Bash, macOS, Linux).
#
#   ./infra/fabric/network.sh up       generate crypto, start nodes, create channel, deploy chaincode
#   ./infra/fabric/network.sh deploy   (re)deploy chaincode only (bumps sequence)
#   ./infra/fabric/network.sh down     stop and wipe everything
set -euo pipefail

VERSION=2.5.16
CHANNEL=campussign
CC_NAME=campussign
# Same chaincode under a second name = isolated world state for integration tests.
CC_NAMES=(campussign campussign-it)
CC_LABEL=campussign_1.0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/infra/fabric"
NET="$ROOT/.fabric/network"
export MSYS_NO_PATHCONV=1

hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
COMPOSE=(docker compose -f "$(hostpath "$HERE/compose.yaml")")

tools() {
  docker run --rm --network fabric_campussign -v "$(hostpath "$NET"):/work" -w /work \
    -e FABRIC_CFG_PATH=/work/peercfg "$@"
}

ORDERER_CA=/work/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem
peer_env() { # $1 = 1|2
  local n=$1 port=$([ "$1" = 1 ] && echo 7051 || echo 9051)
  echo -e "-e CORE_PEER_TLS_ENABLED=true -e CORE_PEER_LOCALMSPID=Org${n}MSP \
-e CORE_PEER_TLS_ROOTCERT_FILE=/work/organizations/peerOrganizations/org${n}.example.com/tlsca/tlsca.org${n}.example.com-cert.pem \
-e CORE_PEER_MSPCONFIGPATH=/work/organizations/peerOrganizations/org${n}.example.com/users/Admin@org${n}.example.com/msp \
-e CORE_PEER_ADDRESS=peer0.org${n}.example.com:${port}"
}
peer() { local org=$1; shift; # shellcheck disable=SC2046
  tools $(peer_env "$org") hyperledger/fabric-tools:$VERSION peer "$@"; }

up() {
  echo "==> generating crypto material"
  rm -rf "$NET"; mkdir -p "$NET/channel-artifacts"
  cp -r "$HERE/config/." "$NET/"
  for f in org1 org2 orderer; do
    docker run --rm -v "$(hostpath "$NET"):/work" -w /work hyperledger/fabric-tools:$VERSION \
      cryptogen generate --config=crypto-config-$f.yaml --output=organizations >/dev/null
  done

  echo "==> starting orderer and peers"
  "${COMPOSE[@]}" up -d orderer.example.com peer0.org1.example.com peer0.org2.example.com
  sleep 5

  echo "==> creating channel '$CHANNEL'"
  docker run --rm -v "$(hostpath "$NET"):/work" -w /work -e FABRIC_CFG_PATH=/work/configtx hyperledger/fabric-tools:$VERSION \
    configtxgen -profile ChannelUsingRaft -outputBlock channel-artifacts/$CHANNEL.block -channelID $CHANNEL >/dev/null 2>&1
  local OADM=/work/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls
  tools hyperledger/fabric-tools:$VERSION osnadmin channel join --channelID $CHANNEL \
    --config-block channel-artifacts/$CHANNEL.block -o orderer.example.com:7053 \
    --ca-file $ORDERER_CA --client-cert $OADM/server.crt --client-key $OADM/server.key >/dev/null
  sleep 3
  for org in 1 2; do
    retry 5 peer $org channel join -b channel-artifacts/$CHANNEL.block
  done
  anchors
  deploy 1
}

anchors() {
  echo "==> setting anchor peers"
  peer 1 version >/dev/null
  # shellcheck disable=SC2046
  tools $(peer_env 1) hyperledger/fabric-tools:$VERSION bash /work/anchor.sh 1 7051
  # shellcheck disable=SC2046
  tools $(peer_env 2) hyperledger/fabric-tools:$VERSION bash /work/anchor.sh 2 9051
}

retry() { local n=$1; shift; for i in $(seq 1 "$n"); do "$@" && return 0; echo "   retry $i/$n"; sleep 3; done; return 1; }

deploy() {
  local seq=${1:-}
  echo "==> packaging chaincode (CCAAS)"
  local pkg="$NET/ccpkg"; rm -rf "$pkg"; mkdir -p "$pkg/src"
  printf '{"address":"campussign-cc:9999","dial_timeout":"10s","tls_required":false}' > "$pkg/src/connection.json"
  printf '{"type":"ccaas","label":"%s"}' "$CC_LABEL" > "$pkg/metadata.json"
  (cd "$pkg/src" && tar czf ../code.tar.gz connection.json)
  (cd "$pkg" && tar czf "$CC_NAME.tgz" metadata.json code.tar.gz)

  for org in 1 2; do peer $org lifecycle chaincode install ccpkg/$CC_NAME.tgz >/dev/null 2>&1 || true; done
  local id; id=$(peer 1 lifecycle chaincode calculatepackageid ccpkg/$CC_NAME.tgz | tr -d '\r')
  echo "    package id: $id"

  echo "==> starting chaincode service"
  CHAINCODE_ID="$id" "${COMPOSE[@]}" --profile chaincode up -d --build campussign-cc

  local P1=/work/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem
  local P2=/work/organizations/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem
  for name in "${CC_NAMES[@]}"; do
    local s=$seq
    if [ -z "$s" ] || [ "$name" != "$CC_NAME" ]; then
      s=$(( $(peer 1 lifecycle chaincode querycommitted -C $CHANNEL -n "$name" -O json 2>/dev/null | grep -o "\"sequence\": *[0-9]*" | grep -o "[0-9]*$" || echo 0) + 1 ))
    fi
    echo "==> approving and committing $name (sequence $s)"
    for org in 1 2; do
      peer $org lifecycle chaincode approveformyorg -o orderer.example.com:7050 --tls --cafile $ORDERER_CA         -C $CHANNEL -n "$name" -v 1.0 --package-id "$id" --sequence "$s" >/dev/null 2>&1
    done
    peer 1 lifecycle chaincode commit -o orderer.example.com:7050 --tls --cafile $ORDERER_CA -C $CHANNEL -n "$name"       -v 1.0 --sequence "$s" --peerAddresses peer0.org1.example.com:7051 --tlsRootCertFiles $P1       --peerAddresses peer0.org2.example.com:9051 --tlsRootCertFiles $P2 >/dev/null 2>&1
  done
  peer 1 lifecycle chaincode querycommitted -C $CHANNEL
  echo "==> ready: channel '$CHANNEL', chaincode '$CC_NAME'"
}

down() {
  "${COMPOSE[@]}" --profile chaincode down -v --remove-orphans
  rm -rf "$NET"
}

case "${1:-}" in
  up) up ;;
  deploy) deploy "${2:-}" ;;
  anchors) anchors ;;
  down) down ;;
  *) echo "usage: $0 up|deploy|anchors|down"; exit 1 ;;
esac
