pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// An eight-leaf private policy tree. The witness exposes one rule to the prover.
template ScopedPermission() {
    signal input root;
    signal input scope;
    signal input nonce;
    signal input amount;
    signal input limit;
    signal input salt;
    signal input siblings[3];
    signal input directions[3];
    signal output binding;

    component amountBits = Num2Bits(128);
    component limitBits = Num2Bits(128);
    amountBits.in <== amount;
    limitBits.in <== limit;
    component withinLimit = LessEqThan(128);
    withinLimit.in[0] <== amount;
    withinLimit.in[1] <== limit;
    withinLimit.out === 1;

    component leaf = Poseidon(3);
    leaf.inputs[0] <== scope;
    leaf.inputs[1] <== limit;
    leaf.inputs[2] <== salt;
    signal nodes[4];
    signal swap[3];
    component parent[3];
    nodes[0] <== leaf.out;
    for (var i = 0; i < 3; i++) {
        directions[i] * (directions[i] - 1) === 0;
        swap[i] <== directions[i] * (siblings[i] - nodes[i]);
        parent[i] = Poseidon(2);
        parent[i].inputs[0] <== nodes[i] + swap[i];
        parent[i].inputs[1] <== siblings[i] - swap[i];
        nodes[i + 1] <== parent[i].out;
    }
    nodes[3] === root;

    component bind = Poseidon(3);
    bind.inputs[0] <== scope;
    bind.inputs[1] <== nonce;
    bind.inputs[2] <== amount;
    binding <== bind.out;
}

component main {public [root, scope, nonce, amount]} = ScopedPermission();
