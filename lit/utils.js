import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LitNetwork, AuthMethodScope } from "@lit-protocol/constants";
import { ethers } from "ethers";
import { ipfsHelpers } from "ipfs-helpers";
import bs58 from "bs58";
import { createERC20SwapLitAction } from "./swapActionGenerator";
import { LitAbility } from "@lit-protocol/types";
import {
    LitActionResource,
    createSiweMessageWithRecaps,
    generateAuthSig,
    LitPKPResource,
} from "@lit-protocol/auth-helpers";
import { LIT_CHAINS } from "@lit-protocol/constants";
import FormData from "form-data";

const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: true,
});

const privateKey1 = process.env.NEXT_PUBLIC_PRIVATE_KEY_1;
const privateKey2 = process.env.NEXT_PUBLIC_PRIVATE_KEY_2;

let mintedPKP = {
    tokenId:
        "0x3621aa84b6eae66bdc2b36bd537e26b196ba15741f581268cf62cd8ac5f58598",
    publicKey:
        "04813d605f5edf2338411a6284960dc8111b0085b8d3a875a512323633ddad160035ef260184b1e09e1a70ea0579a8a273144c88c3ca22e0526817aa72f1df90d9",
    ethAddress: "0x28d23aE1128E4E36fA3a12ecbc293d2EfAc64c76",
};

let action_ipfs = "QmbqKyBPTasRw1BE2DLWaSM4VASae2cSTRy2DC2K7SWuiF";

// swap params --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// chain conditions need chainName
// chain transactions need chainId
// transaction needs chain provider

// deposit1: wA deposits on cB, if action executes, funds are transferred to wB
// deposit1: wB deposits on cA, if action executes, funds are transferred to wA

const chainAParams = {
    from: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    to: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    tokenAddress: "0x7ce2a725e3644D49009c1890dcdBebA8e5D43d4A",
    chain: "baseSepolia",
    amount: "4",
    decimals: 18,
    provider: "https://sepolia.base.org",
};

const chainBParams = {
    from: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    to: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    tokenAddress: "0x42539F21DFc25fD9c4f118a614e32169fc16D30a",
    chain: "yellowstone",
    amount: "8",
    decimals: 18,
    provider: "https://ethereum-sepolia-rpc.publicnode.com",
};

// wallet getters --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function getWalletA() {
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
    console.log("creating lit action..");
    const action = createERC20SwapLitAction(chainAParams, chainBParams);
    const ipfsCid = await uploadViaPinata(action);

    console.log("Lit Action code:\n", action);
    console.log("IPFS CID: ", ipfsCid);
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

    const litContracts = new LitContracts({
        network: LitNetwork.DatilDev,
        debug: false,
    });
    await litContracts.connect();

    let permittedActions =
        await litContracts.pkpPermissionsContract.read.getPermittedActions(
            mintedPKP.tokenId
        );

    let checkGeneratedAction = await stringToBytes(action_ipfs);

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
    console.log("Actions Permissions ", permittedActions);
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

    const gasConfig = {
        maxFeePerGas: "100000000000", // in wei
        maxPriorityFeePerGas: "40000000000", // in wei
        gasLimit: "21000",
    };
    const authSig = await getAuthSig();

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: action_ipfs,
        sessionSigs: sessionSigs,
        jsParams: {
            pkpPublicKey: mintedPKP.publicKey,
            pkpAddress: mintedPKP.ethAddress,
            authSig: JSON.stringify(authSig),
            chainAGasConfig: gasConfig,
            chainBGasConfig: gasConfig,
        },
    });

    console.log("logs: ", results.logs);
    console.log("results: ", results);
    console.log("signatures: ", results.signatures);

    if (results.signatures == undefined) {
        return;
    }

    const signA = formatSignature(results.signatures.chainASignature);
    const signB = formatSignature(results.signatures.chainBSignature);

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

// helper functions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

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

export async function getAuthSig() {
    console.log("creating auth sig..");
    const signer = await getWalletA();

    await litNodeClient.connect();

    const toSign = await createSiweMessageWithRecaps({
        uri: "http://localhost:3000",
        expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
        walletAddress: await signer.getAddress(),
        nonce: await litNodeClient.getLatestBlockhash(),
        litNodeClient,
    });

    const authSig = await generateAuthSig({
        signer: signer,
        toSign,
    });
    return authSig;
}

export async function uploadViaPinata(_litActionCode) {
    const formData = new FormData();

    const file = new File([_litActionCode], "Action.txt", {
        type: "text/plain",
    });

    const pinataMetadata = JSON.stringify({
        name: "EVM-SWAP",
    });

    const pinataOptions = JSON.stringify({
        cidVersion: 0,
    });

    formData.append("file", file);
    formData.append("pinataMetadata", pinataMetadata);
    formData.append("pinataOptions", pinataOptions);

    const key = process.env.NEXT_PUBLIC_PINATA_API;

    const request = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
            },
            body: formData,
        }
    );
    const response = await request.json();
    console.log(response);
    return response.IpfsHash;
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
    // const dataSigned = `0x${signature.dataSigned}`;

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
