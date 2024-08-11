import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LitNetwork, AuthMethodScope } from "@lit-protocol/constants";
import { ethers } from "ethers";
import { ipfsHelpers } from "ipfs-helpers";
import bs58 from "bs58";
import { litAuthAction, swapErc20LitAction } from "./actions";
import { createERC20SwapLitAction } from "./swapActionGenerator";
import { pkpNftAddress, pkpNftAbi } from "../config/abi";
import { LitAbility } from "@lit-protocol/types";
import {
    LitActionResource,
    createSiweMessageWithRecaps,
    generateAuthSig,
    LitPKPResource,
} from "@lit-protocol/auth-helpers";
import { LIT_CHAINS } from "@lit-protocol/constants";

const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: true,
});

const privateKey1 = process.env.NEXT_PUBLIC_PRIVATE_KEY_1;
const privateKey2 = process.env.NEXT_PUBLIC_PRIVATE_KEY_2;

// swap params --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// chain conditions need chainName
// chain transactions need chainId
// transaction needs chain provider

// deposit1: wA deposits on cB, if action executes, funds are transferred to wB
// deposit1: wB deposits on cA, if action executes, funds are transferred to wA

const chainAParams = {
    from: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    to: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    tokenAddress: "0x7ce2a725e3644D49009c1890dcdBebA8e5D43d4A", // token contract
    chain: "baseSepolia",
    amount: "4",
    decimals: 18,
    provider: "https://sepolia.base.org",
};

const chainBParams = {
    from: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    to: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB", // wallet A
    tokenAddress: "0x42539F21DFc25fD9c4f118a614e32169fc16D30a",
    // tokenAddress: "0x31544EC35067c36F53ed3f5a9De1832E890Ad3c2",
    // chain: "sepolia",
    chain: "yellowstone",
    amount: "8",
    decimals: 18,
    provider: "https://ethereum-sepolia-rpc.publicnode.com",
};

// variables -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const LitActionCode_1 = `
const go = async () => {
    const abi = ["function balanceOf(address) view returns (uint256)"];

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        // LIT_CHAINS[chainAParams.chain].rpcUrls[0]
        params.rpc1
    );
    const contract_1 = new ethers.Contract(
        params.chainAParams.tokenAddress,
        abi,
        params.chainAProvider
    );
    const bal_1 = await contract_1.balanceOf(params.mintedPKP.ethAddress);
    const balanceInTokens_1 = ethers.utils.formatUnits(
        bal_1,
        params.chainAParams.decimals
    );
    // const format_requirement_1 = ethers.utils.formatUnits(params.chainAParams.amount, params.chainAParams.decimals);

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        // LIT_CHAINS[chainBParams.chain].rpcUrls[0]
        params.rpc2
    );
    const contract_2 = new ethers.Contract(
        params.chainBParams.tokenAddress,
        abi,
        params.chainBProvider
    );
    const bal_2 = await contract_2.balanceOf(params.mintedPKP.ethAddress);
    const balanceInTokens_2 = ethers.utils.formatUnits(
        bal_2,
        params.chainBParams.decimals
    );

    // const chainAConditionsPass = balanceInTokens_1 >= format_requirement_1

    console.log(balanceInTokens_1, balanceInTokens_2)

    if (balanceInTokens_1 > 0 && balanceInTokens_2 > 0) {
        let toSign = new TextEncoder().encode("Hello World");
        toSign = ethers.utils.arrayify(ethers.utils.keccak256(toSign));

        await Lit.Actions.signEcdsa({
            toSign: toSign,
            publicKey: params.mintedPKP.publicKey,
            sigName: "chainASignature",
        });
        console.log("signed")
    }
     LitActions.setResponse({
        response: "true",
    });
};
go();
`;

const LitActionCode_2 = `
const go = async () => {
    let toSign = new TextEncoder().encode('Hello World');
    toSign = ethers.utils.arrayify(ethers.utils.keccak256(toSign));

    const signature = await Lit.Actions.signEcdsa({
        toSign,
        publicKey,
        sigName: "signature",
    });

    Lit.Actions.setResponse({ response: true });
};
go()
`;

const LitActionCode_3 = `
const go = async () => {
    Lit.Actions.setResponse({ response: true });
};
go()
`;

let action_ipfs_1 = "QmW5Wg1XYE58VQZPShSRdeHJXqPfQXnijJJfYUMbr4Fosk";
// let action_ipfs_2 = "QmYSrjvQy5xgVCRvGFa6ipE53sXYSYYvB7zCFisA23s2kP";
let action_ipfs_2 = "QmYAZrJWSTEkoU2qJtVr8UhbNHUjBuyW5jCEk7RNpNSBV7";
let action_ipfs_3 = "QmXbhh11iycAUhTL1FX5j524cErAs7QqrSJ7uptsRMg2T5";

// for action 1
let mintedPKP_1 = {
    tokenId:
        "95491892207830505561819009983418818315625152553973679153277348121186451091283",
    publicKey:
        "0x04f0665f3591384f456bfe23033a44f49cde42947f043fc790c9421e04fc5b611a78cbc28b3cfbb7552eddebeae99dec51928ba732bbf32680a25bf97da05da8a4",
    ethAddress: "0x146D2E608B19ca3e3B81ffaD0f9FF8fE9ED88815",
};

// for action 2 with transferring the pkp to itself
let mintedPKP_2 = {
    tokenId:
        "0xea3c448648d548e52d9e36ab55d967f4ffcfbb8fce52949909e7f438dfb8a75b",
    publicKey:
        "047aa1f5c9551710a06dfca75365a0581b4a5f02ed7a3e1aa81e38a9af65b99e864ae939e7818271e13fa0be2aa3cb6e6c5dcdd9ad8172f9743b59217180302b42",
    ethAddress: "0x66CF67b8952BD26704a467e518275D21A63a88b6",
};

// for action 2 with keeping the pkp in the same wallet
let mintedPKP_3 = {
    tokenId:
        "0x48add65b3c82bb5e19a318a27b28205e8d6ab0b6c29b6adb9382077eb656e696",
    publicKey:
        "0417ee6f0e3eb8f6b459b0d29c3845d286ae6150e21ab0e991c796c21485decc5a1952bea7fb6499839ddf3e6a9e745042ccfec6c3e986aa4408a0008bcf416415",
    ethAddress: "0x66225c8Ceda52cf1c739E19816f2e35d2F6558f8",
};
// for action 3
let mintedPKP_4 = {
    tokenId:
        "0x3ae2e6624bfb6a0c9a03e9555a6a2b2b6f5b151f59ba7bc2021152ceb7cf9749",
    publicKey:
        "0424c6b7655a639d3d4da89be27e154566a7ef3a321b2ed0b3d5e43006619b203be62369b38c450d6c2d2d6b11375f405d4a51d7d4d4d1248f9722bc372d2d319b",
    ethAddress: "0x75C11F97A6621b4F8C916Faac2E01a7b2BD5EC1c",
};

let mintedPKP = mintedPKP_2;
let action_ipfs = action_ipfs_2;

let params = {
    rpc1: LIT_CHAINS[chainAParams.chain].rpcUrls[0],
    rpc2: LIT_CHAINS[chainBParams.chain].rpcUrls[0],
    chainAParams: chainAParams,
    chainBParams: chainBParams,
    mintedPKP: mintedPKP,
};

// const e = LIT_CHAINS[chainAParams.chain].rpcUrls[0];
// `https://yellowstone-rpc.litprotocol.com/`

// wallet getters --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function getWalletA() {
    // const provider = new ethers.providers.Web3Provider(window.ethereum);
    // const wallet = provider.getSigner();

    const provider = new ethers.providers.JsonRpcProvider(
        `https://yellowstone-rpc.litprotocol.com/`
    );
    const wallet = new ethers.Wallet(privateKey1, provider);
    return wallet;
}

async function getWalletB() {
    const provider = new ethers.providers.JsonRpcProvider(
        `https://yellowstone-rpc.litprotocol.com/`
    );
    const wallet = new ethers.Wallet(privateKey2, provider);
    return wallet;
}

// main functions -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function createLitAction() {
    const action = createERC20SwapLitAction(chainAParams, chainBParams);

    console.log("Lit Action code:\n", action);
}

export async function mintGrantBurnPKP() {
    console.log("minting started..");
    const signerA = await getWalletA();

    const litContracts = new LitContracts({
        signer: signerA,
        network: LitNetwork.DatilDev,
        debug: false,
    });
    await litContracts.connect();

    const mintPkp = await litContracts.pkpNftContractUtils.write.mint();
    const pkp = mintPkp.pkp;
    console.log("PKP: ", pkp);

    console.log("adding permitted action..");

    await litContracts.addPermittedAction({
        pkpTokenId: pkp.tokenId,
        ipfsId: action_ipfs,
        authMethodScopes: [AuthMethodScope.SignAnything],
    });

    console.log("transfer started..");

    const transferPkpOwnershipReceipt =
        await litContracts.pkpNftContract.write.transferFrom(
            signerA.address,
            pkp.ethAddress,
            pkp.tokenId,
            {
                gasLimit: 125_000,
            }
        );

    await transferPkpOwnershipReceipt.wait();

    console.log(
        "Transferred PKP ownership to itself: ",
        transferPkpOwnershipReceipt
    );
}

export async function checkPermits() {
    console.log("checking perms..");
    // const signerA = await getWalletA();

    const litContracts = new LitContracts({
        // signer: signerA,
        network: LitNetwork.DatilDev,
        debug: false,
    });
    await litContracts.connect();

    let permittedActions =
        await litContracts.pkpPermissionsContract.read.getPermittedActions(
            mintedPKP.tokenId
        );

    let checkGeneratedAction = stringToBytes(action_ipfs);

    let permittedAuthMethods =
        await litContracts.pkpPermissionsContract.read.getPermittedAuthMethods(
            mintedPKP.tokenId
        );
    let permittedAddresses =
        await litContracts.pkpPermissionsContract.read.getPermittedAddresses(
            mintedPKP.tokenId
        );

    console.log("ipfs ", action_ipfs);
    console.log("ipfs hex ", checkGeneratedAction);
    console.log("Actions Permissions ", permittedActions, checkGeneratedAction);
    console.log("Auth methods Permissions ", permittedAuthMethods);
    console.log("Addresses Permissions ", permittedAddresses);
}

export async function depositOnChainA() {
    console.log(
        `deposit started from wallet A on chain A (${chainAParams.chain})..`
    );
    let wallet = await getWalletA();

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainAParams.chain].rpcUrls[0]
    );
    wallet = wallet.connect(chainAProvider);

    // sometimes you may manually need to adjust gas limit
    const transactionObject = {
        to: chainAParams.tokenAddress,
        from: await wallet.getAddress(),
        gasPrice: await wallet.provider.getGasPrice(),
        gasLimit: ethers.BigNumber.from("200000"),
        data: generateCallData(
            mintedPKP.ethAddress,
            ethers.utils
                .parseUnits(chainAParams.amount, chainAParams.decimals)
                .toString()
        ),
    };

    const tx = await wallet.sendTransaction(transactionObject);
    const receipt = await tx.wait();

    console.log("deposit executed: ", receipt);
}

export async function depositOnChainB() {
    console.log(
        `deposit started from wallet B on chain B (${chainBParams.chain})..`
    );
    let wallet = await getWalletB();

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainBParams.chain].rpcUrls[0]
    );
    wallet = wallet.connect(chainAProvider);

    // sometimes you may manually need to adjust gas limit
    const transactionObject = {
        to: chainBParams.tokenAddress,
        from: await wallet.getAddress(),
        gasPrice: await wallet.provider.getGasPrice(),
        gasLimit: ethers.BigNumber.from("200000"),
        data: generateCallData(
            mintedPKP.ethAddress,
            ethers.utils
                .parseUnits(chainBParams.amount, chainBParams.decimals)
                .toString()
        ),
    };

    const tx = await wallet.sendTransaction(transactionObject);
    const receipt = await tx.wait();

    console.log("deposit executed: ", receipt);
}

export async function getFundsStatus() {
    console.log("checking balances..");

    const abi = ["function balanceOf(address) view returns (uint256)"];

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainAParams.chain].rpcUrls[0]
    );
    const contract_1 = new ethers.Contract(
        chainAParams.tokenAddress,
        abi,
        chainAProvider
    );
    const bal_1 = await contract_1.balanceOf(mintedPKP.ethAddress);
    const balanceInTokens_1 = ethers.utils.formatUnits(
        bal_1,
        chainAParams.decimals
    );

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainBParams.chain].rpcUrls[0]
    );
    const contract_2 = new ethers.Contract(
        chainBParams.tokenAddress,
        abi,
        chainBProvider
    );
    const bal_2 = await contract_2.balanceOf(mintedPKP.ethAddress);
    const balanceInTokens_2 = ethers.utils.formatUnits(
        bal_2,
        chainBParams.decimals
    );

    console.log("balance on chain A: ", balanceInTokens_1);
    console.log("balance on chain B: ", balanceInTokens_2);
}

export async function executeSwapAction() {
    console.log("executing action started..");
    const sessionSigs = await sessionSigUser();
    const signer = await getWalletA();

    const gasConfig = {
        maxFeePerGas: "100000000000", // in wei
        maxPriorityFeePerGas: "40000000000", // in wei
        gasLimit: "21000",
    };

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: action_ipfs,
        sessionSigs: sessionSigs,
        jsParams: {
            pkpAddress: mintedPKP.ethAddress,
            pkpPublicKey: mintedPKP.publicKey,
            chainAGasConfig: gasConfig,
            chainBGasConfig: gasConfig,
            authSig: JSON.stringify(
                await generateAuthSig({
                    signer: signer,
                    toSign: await createSiweMessageWithRecaps({
                        uri: "http://localhost",
                        expiration: new Date(
                            Date.now() + 1000 * 60 * 60 * 24
                        ).toISOString(), // 24 hours
                        walletAddress: await signer.getAddress(),
                        nonce: await litNodeClient.getLatestBlockhash(),
                        litNodeClient,
                    }),
                })
            ),
        },
    });

    console.log("logs: ", results.logs);
    console.log("results: ", results);
    console.log("signatures: ", results.signatures);

    if (results.response == "Conditions for swap not met!") {
        return;
    }

    const signA = formatSignature(results.signatures.chainATransaction);
    const signB = formatSignature(results.signatures.chainASignature);

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        chainAParams.provider
    );

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        chainBParams.provider
    );

    const tx1 = await chainAProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainATransaction,
            signA
        )
    );

    const tx2 = await chainBProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainBTransaction,
            signB
        )
    );

    console.log("swap tx1: ", tx1);
    console.log("swap tx2: ", tx2);
}

export async function executeTestAction() {
    console.log("executing action started..");
    const sessionSigs = await sessionSigUser();
    // const signer = await getWalletA();

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: action_ipfs,
        sessionSigs: sessionSigs,
        jsParams: {
            publicKey: mintedPKP.publicKey,
            params: params,
        },
    });

    console.log("logs: ", results.logs);
    console.log("results: ", results);
    console.log("signatures: ", results.signatures);
}

// helper functions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function uploadLitActionToIPFS(litActionCode) {
    const ipfsHash = await ipfsHelpers.stringToCidV0(litActionCode);

    console.log("ipfsHash: ", ipfsHash);

    return ipfsHash;
}

async function uploadViaPinata(_litActionCode) {
    const res = await fetch(
        "https://explorer.litprotocol.com/api/pinata/upload",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ _litActionCode }),
        }
    );
    const ipfsData = await res.json();
    console.log("ipfsData pinata:", ipfsData);
    return ipfsData;
}

async function stringToBytes(_string) {
    const LIT_ACTION_IPFS_CID_BYTES = `0x${Buffer.from(
        bs58.decode(_string)
    ).toString("hex")}`;

    return LIT_ACTION_IPFS_CID_BYTES;
}

export function BytesToString(_bytesString) {
    const decoded = bs58.encode(_bytesString);
    return decoded;
}

function formatSignature(signature) {
    const dataSigned = `0x${signature.dataSigned}`;

    const encodedSig = ethers.utils.joinSignature({
        v: signature.recid,
        r: `0x${signature.r}`,
        s: `0x${signature.s}`,
    });

    return encodedSig;
}

function generateCallData(counterParty, amount) {
    const transferInterface = new ethers.utils.Interface([
        "function transfer(address, uint256) returns (bool)",
    ]);
    return transferInterface.encodeFunctionData("transfer", [
        counterParty,
        amount,
    ]);
}

// session sigs --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function sessionSigLitAction() {
    console.log("creating session sig..");
    // const authWalletA = await getWalletA();

    await litNodeClient.connect();

    const pkpSessionSigsA = await litNodeClient.getLitActionSessionSigs({
        pkpPublicKey: mintedPKP.publicKey,
        resourceAbilityRequests: [
            {
                resource: new LitPKPResource("*"),
                ability: LitAbility.PKPSigning,
            },
            {
                resource: new LitActionResource("*"),
                ability: LitAbility.LitActionExecution,
            },
        ],
        litActionIpfsId: action_ipfs,
        jsParams: {
            publicKey: mintedPKP.publicKey,
            params: params,
        },
    });

    console.log("sessionSigs: ", pkpSessionSigsA);
    return pkpSessionSigsA;
}

export async function sessionSigUser() {
    console.log("creating session sigs..");
    const ethersSigner = await getWalletA();

    await litNodeClient.connect();

    const sessionSigs = await litNodeClient.getSessionSigs({
        publicKey: mintedPKP.publicKey,
        chain: "ethereum",
        resourceAbilityRequests: [
            {
                resource: new LitPKPResource("*"),
                ability: LitAbility.PKPSigning,
            },
            {
                resource: new LitActionResource("*"),
                ability: LitAbility.LitActionExecution,
            },
        ],
        authNeededCallback: async ({ resourceAbilityRequests }) => {
            const toSign = await createSiweMessageWithRecaps({
                uri: "http://localhost:3000",
                expiration: new Date(
                    Date.now() + 1000 * 60 * 60 * 24
                ).toISOString(), // 24 hours,
                resources: resourceAbilityRequests,
                walletAddress: await ethersSigner.getAddress(),
                nonce: await litNodeClient.getLatestBlockhash(),
                litNodeClient,
            });

            return await generateAuthSig({
                signer: ethersSigner,
                toSign,
            });
        },
    });

    console.log("sessionSigs: ", sessionSigs);
    return sessionSigs;
}
