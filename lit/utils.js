import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LitNetwork, AuthMethodScope, LIT_CHAINS } from "@lit-protocol/constants";
import { LitAbility } from "@lit-protocol/types";
import {
    LitActionResource,
    createSiweMessageWithRecaps,
    generateAuthSig,
    LitPKPResource,
} from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";
import bs58 from "bs58";
import { createERC20SwapLitAction } from "./swapActionGenerator";

const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: true,
});

let mintedPKP, action_ipfs;

// swap params --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// deposit1: wA deposits on cB, if action executes, funds are transferred to wB
// deposit2: wB deposits on cA, if action executes, funds are transferred to wA

const chainAParams = {
    from: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    to: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    tokenAddress: "0xad50f302a957C165d865eD398fC3ca5A5A2cDA85",
    chain: "baseSepolia",
    amount: "4",
    decimals: 18,
    chainId: 84532,
};

const chainBParams = {
    from: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    to: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    tokenAddress: "0x2dcA1a80c89c81C37efa7b401e2d20c1ED99C72F",
    chain: "yellowstone",
    amount: "8",
    decimals: 18,
    chainId: 175188,
};

// wallet getters --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function getWalletA() {
    const provider = new ethers.providers.JsonRpcProvider(
        `https://yellowstone-rpc.litprotocol.com/`
    );
    const wallet = new ethers.Wallet(
        process.env.NEXT_PUBLIC_PRIVATE_KEY_1,
        provider
    );
    return wallet;
}

async function getWalletB() {
    const provider = new ethers.providers.JsonRpcProvider(
        `https://yellowstone-rpc.litprotocol.com/`
    );
    const wallet = new ethers.Wallet(
        process.env.NEXT_PUBLIC_PRIVATE_KEY_2,
        provider
    );
    return wallet;
}

// main functions -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function createLitAction() {
    console.log("creating lit action..");
    const action = createERC20SwapLitAction(chainAParams, chainBParams);
    const ipfsCid = await uploadViaPinata(action);

    console.log("Lit Action code:\n", action);
    console.log("IPFS CID: ", ipfsCid);
    return ipfsCid;
}

export async function mintGrantBurnPKP(_action_ipfs, _mintedPKP) {
    _action_ipfs ? (action_ipfs = _action_ipfs) : null;
    _mintedPKP ? (mintedPKP = _mintedPKP) : null;

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

    const transferPkpOwnership =
        await litContracts.pkpNftContract.write.transferFrom(
            signerA.address,
            pkp.ethAddress,
            pkp.tokenId,
            {
                gasLimit: 125_000,
            }
        );

    const receipt = await transferPkpOwnership.wait();

    console.log(
        "Transferred PKP ownership to itself: ",
        receipt
    );
    return pkp;
}

export async function depositOnChainA(_action_ipfs, _mintedPKP) {
    _action_ipfs ? (action_ipfs = _action_ipfs) : null;
    _mintedPKP ? (mintedPKP = _mintedPKP) : null;

    console.log(
        `deposit started from wallet A on chain A (${chainAParams.chain})..`
    );
    let wallet = await getWalletA();

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainAParams.chain].rpcUrls[0]
    );
    wallet = wallet.connect(chainAProvider);

    // sometimes you may need to add gasLimit
    const transactionObject = {
        to: chainAParams.tokenAddress,
        from: await wallet.getAddress(),
        data: generateCallData(
            mintedPKP.ethAddress,
            ethers.utils
                .parseUnits(chainAParams.amount, chainAParams.decimals)
                .toString()
        ),
    };

    const tx = await wallet.sendTransaction(transactionObject);
    const receipt = await tx.wait();

    console.log("token deposit executed: ", receipt);

    console.log("depositing some funds for gas..");

    // gas value differs for chains, check explorer for more info
    const transactionObject2 = {
        to: mintedPKP.ethAddress,
        value: ethers.BigNumber.from("1000000000000000"),
        gasPrice: await chainAProvider.getGasPrice(),
    };

    const tx2 = await wallet.sendTransaction(transactionObject2);
    const receipt2 = await tx2.wait();

    console.log("gas deposit executed: ", receipt2);
}

export async function depositOnChainB(_action_ipfs, _mintedPKP) {
    _action_ipfs ? (action_ipfs = _action_ipfs) : null;
    _mintedPKP ? (mintedPKP = _mintedPKP) : null;

    console.log(
        `deposit started from wallet B on chain B (${chainBParams.chain})..`
    );
    let wallet = await getWalletB();

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainBParams.chain].rpcUrls[0]
    );
    wallet = wallet.connect(chainBProvider);

    const transactionObject = {
        to: chainBParams.tokenAddress,
        from: await wallet.getAddress(),
        gasPrice: await chainBProvider.getGasPrice(),
        data: generateCallData(
            mintedPKP.ethAddress,
            ethers.utils
                .parseUnits(chainBParams.amount, chainBParams.decimals)
                .toString()
        ),
    };
    
    const tx = await wallet.sendTransaction(transactionObject);
    const receipt = await tx.wait();

    console.log("token deposit executed: ", receipt);

    console.log("depositing some funds for gas..");

    // gas value differs for chains, check explorer for more info
    const transactionObject2 = {
        to: mintedPKP.ethAddress,
        value: ethers.BigNumber.from("100000000000000"),
        gasPrice: await wallet.provider.getGasPrice(),
    };

    const tx2 = await wallet.sendTransaction(transactionObject2);
    const receipt2 = await tx2.wait();

    console.log("gas deposit executed: ", receipt2);
}

export async function executeSwapAction(_action_ipfs, _mintedPKP) {
    _action_ipfs ? (action_ipfs = _action_ipfs) : null;
    _mintedPKP ? (mintedPKP = _mintedPKP) : null;

    console.log("executing action started..");
    const sessionSigs = await sessionSigEOA();
    const authSig = await getAuthSig();

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainAParams.chain].rpcUrls[0]
    );

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainBParams.chain].rpcUrls[0]
    );

    // sometimes you may need to configure gas values manually, try checking test minting methods for more info
    const gasConfigA = {
        gasLimit: ethers.BigNumber.from("54000"),
        maxPriorityFeePerGas: ethers.BigNumber.from("1500000000"),
        maxFeePerGas: ethers.BigNumber.from("1510000362"),
        chainId: LIT_CHAINS[chainAParams.chain].chainId,
        nonce: await chainAProvider.getTransactionCount(mintedPKP.ethAddress),
    };

    const gasConfigB = {
        maxFeePerGas: ethers.BigNumber.from("1500000000"),
        chainId: LIT_CHAINS[chainBParams.chain].chainId,
        nonce: await chainBProvider.getTransactionCount(mintedPKP.ethAddress),
    };

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: action_ipfs,
        sessionSigs: sessionSigs,
        jsParams: {
            pkpPublicKey: mintedPKP.publicKey,
            pkpAddress: mintedPKP.ethAddress,
            authSig: JSON.stringify(authSig),
            chainAGasConfig: gasConfigA,
            chainBGasConfig: gasConfigB,
        },
    });

    console.log("results: ", results);

    if (results.signatures == undefined) {
        return;
    }

    else if (results.signatures.chainBSignature == undefined) {
        console.log("executing clawbackA tx..")
        await executeTxA(results, chainAProvider);
    }

    else if (results.signatures.chainASignature == undefined) {
        console.log("executing clawbackB tx..")
        await executeTxB(results, chainBProvider);
    }

    else {
        console.log("executing swap txs..")
        await executeTxA(results, chainAProvider);
        await executeTxB(results, chainBProvider);
    }
}

async function executeTxA(results, chainAProvider) {
    const signatureA = formatSignature(results.signatures.chainASignature);
    
    // console.log("txA obj", results.response.chainATransaction);
    
    const tx1 = await chainAProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainATransaction,
            signatureA
        )
    );
    console.log(tx1);
    
    const receipt1 = await tx1.wait();
    const blockExplorer1 = LIT_CHAINS[chainAParams.chain].blockExplorerUrls[0];
    
    console.log(`tx: ${blockExplorer1}/tx/${receipt1.transactionHash}`);
}

async function executeTxB(results, chainBProvider) {
    const signatureB = formatSignature(results.signatures.chainBSignature);

    // console.log("txB obj", results.response.chainBTransaction);

    const tx2 = await chainBProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainBTransaction,
            signatureB
        )
    );
    const receipt2 = await tx2.wait();
    const blockExplorer2 = LIT_CHAINS[chainBParams.chain].blockExplorerUrls[0];

    console.log(`tx: ${blockExplorer2}/tx/${receipt2.transactionHash}`);
}

// additional functions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function checkPermits(_action_ipfs, _mintedPKP) {
    _action_ipfs ? (action_ipfs = _action_ipfs) : null;
    _mintedPKP ? (mintedPKP = _mintedPKP) : null;

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

export async function mintTokensOnBothChains() {
    console.log("minting tokens on both wallets..");
    const abi = ["function mintTo(address)"];

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainAParams.chain].rpcUrls[0]
    );
    const chainBProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainBParams.chain].rpcUrls[0]
    );

    let signer_A = await getWalletA();
    signer_A = signer_A.connect(chainAProvider);
    const tokenContract_A = new ethers.Contract(
        chainAParams.tokenAddress,
        abi,
        signer_A
    );
    const mint_A = await tokenContract_A.mintTo(signer_A.address);
    // console.log("gas info on chain A", mint_A)
    const receiptA = await mint_A.wait();
    console.log(receiptA);

    let signer_B = await getWalletB();
    signer_A = signer_B.connect(chainBProvider);
    const tokenContract_B = new ethers.Contract(
        chainBParams.tokenAddress,
        abi,
        signer_B
    );
    const mint_B = await tokenContract_B.mintTo(signer_B.address);
    // console.log("gas info on chain B", mint_B)
    const receiptB = await mint_B.wait();
    console.log(receiptB);

    console.log("minted");
}

export async function getFundsStatusPKP(_action_ipfs, _mintedPKP) {
    _action_ipfs ? (action_ipfs = _action_ipfs) : null;
    _mintedPKP ? (mintedPKP = _mintedPKP) : null;

    console.log("checking balances on pkp..");

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

export async function getFundsStatusWallet() {
    console.log("checking balances on wallets..");

    const abi = ["function balanceOf(address) view returns (uint256)"];

    let signer_A = await getWalletA();
    let signer_B = await getWalletB();

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainAParams.chain].rpcUrls[0]
    );
    const chainBProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainBParams.chain].rpcUrls[0]
    );

    signer_A = signer_A.connect(chainAProvider);
    const tokenContract_CA_WA = new ethers.Contract(
        chainAParams.tokenAddress,
        abi,
        signer_A
    );
    const balance_CA_WA = ethers.utils.formatUnits(
        await tokenContract_CA_WA.balanceOf(signer_A.address),
        chainAParams.decimals
    );

    signer_B = signer_B.connect(chainAProvider);
    const tokenContract_CA_WB = new ethers.Contract(
        chainAParams.tokenAddress,
        abi,
        signer_B
    );
    const balance_CA_WB = ethers.utils.formatUnits(
        await tokenContract_CA_WB.balanceOf(signer_B.address),
        chainAParams.decimals
    );

    signer_A = signer_A.connect(chainBProvider);
    const tokenContract_CB_WA = new ethers.Contract(
        chainBParams.tokenAddress,
        abi,
        signer_A
    );
    const balance_CB_WA = ethers.utils.formatUnits(
        await tokenContract_CB_WA.balanceOf(signer_A.address),
        chainBParams.decimals
    );

    signer_B = signer_B.connect(chainBProvider);
    const tokenContract_CB_WB = new ethers.Contract(
        chainBParams.tokenAddress,
        abi,
        signer_B
    );
    const balance_CB_WB = ethers.utils.formatUnits(
        await tokenContract_CB_WB.balanceOf(signer_B.address),
        chainBParams.decimals
    );

    console.log(
        `Chain A:\n${signer_A.address}, ${balance_CA_WA} ${signer_B.address}, ${balance_CA_WB}`
    );
    console.log(
        `Chain B:\n${signer_A.address}, ${balance_CB_WA} ${signer_B.address}, ${balance_CB_WB}`
    );
}

// helper functions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

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
    const bytes = `0x${Buffer.from(bs58.decode(_string)).toString("hex")}`;
    return bytes;
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

export async function sessionSigEOA() {
    console.log("creating session sigs..");
    const ethersSigner = await getWalletA();

    await litNodeClient.connect();

    const sessionSigs = await litNodeClient.getSessionSigs({
        pkpPublicKey: mintedPKP.publicKey,
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
        authNeededCallback: async (params) => {
            if (!params.uri) {
                throw new Error("Params uri is required");
            }

            if (!params.resourceAbilityRequests) {
                throw new Error("Params uri is required");
            }

            const toSign = await createSiweMessageWithRecaps({
                uri: params.uri,
                expiration: new Date(
                    Date.now() + 1000 * 60 * 60 * 24
                ).toISOString(), // 24 hours,
                resources: params.resourceAbilityRequests,
                walletAddress: await ethersSigner.getAddress(),
                nonce: await litNodeClient.getLatestBlockhash(),
                litNodeClient,
                domain: "localhost:3000",
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

function formatSignature(signature) {
    const encodedSig = ethers.utils.joinSignature({
        v: signature.recid,
        r: `0x${signature.r}`,
        s: `0x${signature.s}`,
    });
    return encodedSig;
}
