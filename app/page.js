"use client";
import {
    createLitAction,
    depositOnChainA,
    depositOnChainB,
    getFundsStatus,
    mintGrantBurnPKP,
    executeSwapAction,
    executeTestAction,
    checkPermits,
    sessionSigLitAction,
    sessionSigUser
} from "../lit/utils.js";

export default function Home() {
    return (
        <div className="flex flex-col items-center gap-[1.2rem]">
            <h1 className="mb-[1.5rem] mt-[0.8rem]">Lit EVM-EVM Bridge Demo</h1>
            <button onClick={createLitAction}>Create Lit Action</button>
            <button onClick={mintGrantBurnPKP}>
                Create a Mint Grant Burn PKP
            </button>
            <button onClick={checkPermits}>Check Permissions</button>
            <button onClick={sessionSigLitAction}>Session Sig via Lit Action</button>
            <button onClick={sessionSigUser}>Session Sig via User</button>
            <button onClick={depositOnChainA}>Deposit A</button>
            <button onClick={depositOnChainB}>Deposit B</button>
            <button onClick={getFundsStatus}>Funds Status</button>
            <button onClick={executeSwapAction}>Execute Swap Action</button>
            <button onClick={executeTestAction}>Execute Test Action</button>
        </div>
    );
}
