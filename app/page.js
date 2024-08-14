"use client";
import { useState } from "react";
import {
    createLitAction,
    depositOnChainA,
    depositOnChainB,
    mintGrantBurnPKP,
    executeSwapAction,
    checkPermits,
    mintTokensOnBothChains,
    getFundsStatusPKP,
    getFundsStatusWallet
} from "../lit/utils.js";

export default function Home() {
    const [ipfsId, setIpfsId] = useState(null);
    const [pkp, setPkp] = useState(null);

    async function createLitActionCall() {
        const ipfs = await createLitAction();
        setIpfsId(ipfs);
    }

    async function mintGrantBurnPKPCall() {
        const mintedPkp = await mintGrantBurnPKP(ipfsId);
        setPkp(mintedPkp);
    }

    return (
        <div className="flex flex-col items-center gap-[1.2rem]">
            <h1 className="mb-[1.5rem] mt-[0.8rem]">
                LIT EVM-EVM Bridge Demo (Open Console)
            </h1>
            <p>ipfsId, {ipfsId}</p>
            <p className="mb-[1.5rem]">pkpAddress, {pkp?.ethAddress}</p>
            <button onClick={createLitActionCall}>Generate Lit Action</button>
            <button onClick={mintGrantBurnPKPCall}>Mint Grant Burn PKP</button>
            <button onClick={() => depositOnChainA(ipfsId, pkp)}>
                Deposit A
            </button>
            <button onClick={() => depositOnChainB(ipfsId, pkp)}>
                Deposit B
            </button>
            <button
                className="mb-[1.5rem]"
                onClick={() => executeSwapAction(ipfsId, pkp)}
            >
                Execute Swap Action
            </button>
            <button onClick={() => checkPermits(ipfsId, pkp)}>
                Check Permissions on PKP
            </button>
            <button onClick={() => mintTokensOnBothChains(ipfsId, pkp)}>
                Mint Test Tokens to Wallets
            </button>
            <button onClick={() => getFundsStatusPKP(ipfsId, pkp)}>
                Funds Status on PKP
            </button>
            <button onClick={getFundsStatusWallet}>
                Funds Status on Wallet
            </button>
        </div>
    );
}
