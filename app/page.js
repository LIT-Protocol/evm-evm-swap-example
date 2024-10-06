"use client";
import { useState } from "react";
import {
    createLitAction,
    mintGrantBurnPKP,
    userASignsSwap,
    userBSignsSwap,
    executeSwapActionWithGenerate,
    executeSwapActionWithExecute,
    mintTokensOnBothChains,
    depositOnChainA,
    depositOnChainB,
    checkPermitsPKP,
    getFundsStatusPKP,
    getFundsStatusUserWallets,
    executeTestAction,
} from "../lit-refactor/utils";

export default function Home() {
    const [ipfsId, setIpfsId] = useState(null);
    const [pkp, setPkp] = useState(null);
    const [swapObject, setSwapObject] = useState(null);
    const [swapObjectHash, setSwapObjectHash] = useState(null);
    const [authSigAlice, setAuthSigAlice] = useState(null);
    const [authSigBob, setAuthSigBob] = useState(null);

    async function createLitActionCall() {
        const res = await createLitAction();
        setIpfsId(res.ipfsCid);
        setSwapObject(res.swapObject);
        setSwapObjectHash(res.swapObjectHash);
    }

    return (
        <div className="flex flex-col items-center gap-[1.2rem]">
            <h1 className="mb-[1.5rem] mt-[0.8rem]">
                LIT EVM-EVM Bridge Demo (Open Console)
            </h1>
            <p>ipfsId, {ipfsId}</p>
            <p className="mb-[1.5rem]">pkpAddress, {pkp?.ethAddress}</p>
            <button onClick={createLitActionCall}>Generate Lit Action</button>
            <button
                onClick={async () => setPkp(await mintGrantBurnPKP(ipfsId))}
            >
                Mint Grant Burn PKP
            </button>
            <button
                onClick={async () =>
                    setAuthSigAlice(await userASignsSwap(swapObject, swapObjectHash))
                }
            >
                Sign Swap by Alice
            </button>
            <button
                onClick={async () =>
                    setAuthSigBob(await userBSignsSwap(swapObject, swapObjectHash))
                }
            >
                Sign Swap by Bob
            </button>
            <button
                onClick={async () =>
                    setAuthSigBob(await executeSwapActionWithGenerate(ipfsId, pkp, swapObject, authSigAlice, authSigBob))
                }
            >
                Call Action with Generate
            </button>
            <button
                className="mb-[1.5rem]"
                onClick={async () =>
                    setAuthSigBob(await executeSwapActionWithExecute(ipfsId))
                }
            >
                Call Action with Execute
            </button>

            <button onClick={() => mintTokensOnBothChains(ipfsId, pkp)}>
                Mint Test Tokens to Wallets
            </button>
            <button onClick={() => depositOnChainA(ipfsId, pkp)}>
                Deposit A
            </button>
            <button onClick={() => depositOnChainB(ipfsId, pkp)}>
                Deposit B
            </button>
            <button onClick={() => checkPermitsPKP(ipfsId, pkp)}>
                Check Permissions on PKP
            </button>

            <button onClick={() => getFundsStatusPKP(ipfsId, pkp)}>
                Funds Status on PKP
            </button>
            <button onClick={getFundsStatusUserWallets}>
                Funds Status on Wallet
            </button>
        </div>
    );
}
