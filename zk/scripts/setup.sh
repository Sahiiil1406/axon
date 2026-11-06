#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p build
if [[ -e build/scoped.zkey ]]; then
  echo "build/scoped.zkey already exists. Keep the verifier and proving key paired." >&2
  exit 1
fi
bin="$PWD/node_modules/.bin"
"$bin/circom2" circuits/scoped-permission.circom --r1cs --wasm -l node_modules -o build
"$bin/snarkjs" powersoftau new bn128 12 build/pot0.ptau
"$bin/snarkjs" powersoftau contribute build/pot0.ptau build/pot1.ptau --name=axondemo -e="$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
"$bin/snarkjs" powersoftau prepare phase2 build/pot1.ptau build/pot2.ptau
"$bin/snarkjs" groth16 setup build/scoped-permission.r1cs build/pot2.ptau build/scoped0.zkey
"$bin/snarkjs" zkey contribute build/scoped0.zkey build/scoped.zkey --name=axondemo -e="$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
"$bin/snarkjs" zkey export verificationkey build/scoped.zkey build/verification-key.json
"$bin/snarkjs" zkey export solidityverifier build/scoped.zkey build/Groth16Verifier.sol
