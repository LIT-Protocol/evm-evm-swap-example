import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import {
    LitNetwork,
    AuthMethodType,
    AuthMethodScope,
    LIT_CHAINS,
    LIT_RPC
} from "@lit-protocol/constants";
import { LitAbility } from "@lit-protocol/types";
import {
    LitActionResource,
    createSiweMessageWithRecaps,
    generateAuthSig,
    LitPKPResource,
    createSiweMessage,
    AuthSig
} from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";
import bs58 from "bs58";
import { litActionCode } from "./litAction";

interface Pkp {
    publicKey: string;
    ethAddress: string;
    tokenId: string;
}

enum currencyType {
    'NATIVE',
    'ERC20'
}

interface SwapObject {
    chainA: string,
    chainAId: number,
    chainB: string,
    chainBId: number,
    accountA: string,
    accountB: string,
    amountA: string,
    amountB: string,
    contractA: string,
    contractB: string,
    currencyAType: currencyType,
    currencyBType: currencyType,
    expirationA: string,
    expirationB: string,
}

interface swapParams {
    chainA: string,
    chainB: string,
    accountA: string,
    accountB: string,
    amountA: string,
    amountB: string,
    decimalsA: number,
    decimalsB: number,
    contractA: string,
    contractB: string,
    currencyAType: currencyType,
    currencyBType: currencyType,
    expirationDays: string
}

const swapParams: swapParams = {
    chainA: "baseSepolia",
    chainB: "yellowstone",
    accountA: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    accountB: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    amountA: "8",
    amountB: "4",
    decimalsA: 18,
    decimalsB: 18,
    contractA: "0xad50f302a957C165d865eD398fC3ca5A5A2cDA85",
    contractB: "0x2dcA1a80c89c81C37efa7b401e2d20c1ED99C72F",
    currencyAType: currencyType.ERC20,
    currencyBType: currencyType.NATIVE,
    expirationDays: "4",
  };

let mintedPKP: Pkp, action_ipfs: string, swapObject: SwapObject, swapObjectHash: string, authSigAlice: AuthSig, authSigBob: AuthSig;

// major functions ----------------------------

const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: false,
})

export async function createLitAction() {
    console.log("creating lit action..");
    const swapObject: SwapObject = {
        chainA: swapParams.chainA,
        chainAId: LIT_CHAINS[swapParams.chainA].chainId,
        chainB: swapParams.chainB,
        chainBId: LIT_CHAINS[swapParams.chainB].chainId,
        accountA: swapParams.accountA,
        accountB: swapParams.accountB,
        amountA: ethers.utils.parseUnits(swapParams.amountA, swapParams.decimalsA).toString(),
        amountB: ethers.utils.parseUnits(swapParams.amountB, swapParams.decimalsB).toString(),
        contractA: swapParams.contractA,
        contractB: swapParams.contractB,
        currencyAType: swapParams.currencyAType,
        currencyBType: swapParams.currencyBType,
        expirationA: (Math.floor(Date.now() / 1000) + 60 * 60 * 24 * parseInt(swapParams.expirationDays)).toString(),
        expirationB: (Math.floor(Date.now() / 1000) + 60 * 60 * 24 * parseInt(swapParams.expirationDays)).toString(),
    };

    const ipfsCid = await uploadViaPinata(litActionCode);

    const sortedSwapString = JSON.stringify(
        Object.keys(swapObject)
          .sort()
          .reduce((obj, key) => {
            obj[key] = swapObject[key];
            return obj;
          }, {})
      );
      
      swapObjectHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(sortedSwapString)
      );

    console.log("Lit Action code:\n", litActionCode);
    console.log("IPFS CID: ", ipfsCid);
    console.log("Swap Object Hash: ", swapObjectHash);
    return ipfsCid;
}

export async function mintGrantBurnPKP(_action_ipfs: string) {
    _action_ipfs ? null : (_action_ipfs = action_ipfs);

    console.log("minting started..");
    const signer = getEvmWalletA();

    const litContracts = new LitContracts({
        signer: signer,
        network: LitNetwork.DatilDev,
        debug: false,
    });

    await litContracts.connect();

    const bytesAction = `0x${Buffer.from(bs58.decode(_action_ipfs)).toString("hex")}`;

    const pkpMintCost = await litContracts.pkpNftContract.read.mintCost();

    const tx =
        await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
            AuthMethodType.LitAction,
            [AuthMethodType.LitAction],
            [bytesAction],
            ["0x"],
            [[AuthMethodScope.SignAnything]],
            false,
            true,
            {
                value: pkpMintCost,
            }
        );

    const receipt = await tx.wait();
    console.log(
        "pkp minted, added lit action as auth, and transferred to itself: ",
        receipt
    );

    const pkpInfo = await getPkpInfoFromMintReceipt(receipt, litContracts);
    console.log("pkp: ", pkpInfo);

    return pkpInfo;
}

export async function userASignsSwap() {
    const ethersWalletAlice = getEvmWalletA();

    const siweMessageAlice = await createSiweMessage({
        walletAddress: ethersWalletAlice.address,
        nonce: await litNodeClient.getLatestBlockhash(),
        expiration: swapObject.expirationA,
        statement: swapObjectHash
    });
    
    authSigAlice = await generateAuthSig({
        signer: ethersWalletAlice,
        toSign: siweMessageAlice,
    });
    
}

export async function userBSignsSwap() {
    const ethersWalletBob = getEvmWalletB();

    const siweMessageBob = await createSiweMessage({
        walletAddress: ethersWalletBob.address,
        nonce: await litNodeClient.getLatestBlockhash(),
        expiration: swapObject.expirationB,
        statement: swapObjectHash
    });
    authSigBob = await generateAuthSig({
        signer: ethersWalletBob,
        toSign: siweMessageBob,
    });
}

export async function executeSwapAction(_action_ipfs, _mintedPKP) {
    _action_ipfs ? (action_ipfs = _action_ipfs) : null;
    _mintedPKP ? (mintedPKP = _mintedPKP) : null;

    console.log("executing action started..");

    const signer = getEvmWalletA();
    const sessionSigs = await sessionSigEOA(signer, _mintedPKP);

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[swapObject.chainA].rpcUrls[0]
    );

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[swapObject.chainB].rpcUrls[0]
    );

    // sometimes you may need to configure gas values manually, try checking test minting methods for more info
    const gasConfigA = {
        gasLimit: ethers.BigNumber.from("54000"),
        maxPriorityFeePerGas: ethers.BigNumber.from("1500000000"),
        maxFeePerGas: ethers.BigNumber.from("1510000362"),
        chainId: LIT_CHAINS[swapObject.chainA].chainId,
        nonce: await chainAProvider.getTransactionCount(mintedPKP.ethAddress),
    };

    const gasConfigB = {
        maxFeePerGas: ethers.BigNumber.from("1500000000"),
        chainId: LIT_CHAINS[swapObject.chainB].chainId,
        nonce: await chainBProvider.getTransactionCount(mintedPKP.ethAddress),
    };

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: action_ipfs,
        sessionSigs: sessionSigs,
        jsParams: {
            pkpPublicKey: mintedPKP.publicKey,
            pkpAddress: mintedPKP.ethAddress,
            swapObject,
            userAAuthSig: authSigAlice,
            userBAuthSig: authSigBob,
            chainAGasConfig: gasConfigA,
            chainBGasConfig: gasConfigB,
        },
    });

    console.log("results: ", results);

    if (results.signatures == undefined) {
        return;
    } else if (!results?.signatures?.chainBSignature) {
        console.log("executing clawbackA tx..");
        await broadcastOnChainA(results, chainAProvider);
    } else if (!results?.signatures?.chainBSignature) {
        console.log("executing clawbackB tx..");
        await broadcastOnChainB(results, chainBProvider);
    } else {
        console.log("executing swap txs..");
        await broadcastOnChainA(results, chainAProvider);
        await broadcastOnChainB(results, chainBProvider);
    }
}

async function broadcastOnChainA(results, chainAProvider) {
    const signatureA = formatSignature(results.signatures.chainASignature);

    const tx1 = await chainAProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainATransaction,
            signatureA
        )
    );
    console.log(tx1);

    const receipt1 = await tx1.wait();
    const blockExplorer1 = LIT_CHAINS[swapObject.chainA].blockExplorerUrls[0];

    console.log(`tx: ${blockExplorer1}/tx/${receipt1.transactionHash}`);
}

async function broadcastOnChainB(results, chainBProvider) {
    const signatureB = formatSignature(results.signatures.chainBSignature);

    const tx2 = await chainBProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainBTransaction,
            signatureB
        )
    );
    const receipt2 = await tx2.wait();
    const blockExplorer2 = LIT_CHAINS[swapObject.chainB].blockExplorerUrls[0];

    console.log(`tx: ${blockExplorer2}/tx/${receipt2.transactionHash}`);
}

// helper function -----------------------------------

function getEvmWalletA() {
    const provider = new ethers.providers.JsonRpcProvider(
        LIT_RPC.CHRONICLE_YELLOWSTONE
    );
    const wallet = new ethers.Wallet(
        process.env.NEXT_PUBLIC_PRIVATE_KEY_1,
        provider
    );
    return wallet;
}

function getEvmWalletB() {
    const provider = new ethers.providers.JsonRpcProvider(
        LIT_RPC.CHRONICLE_YELLOWSTONE
    );
    const wallet = new ethers.Wallet(
        process.env.NEXT_PUBLIC_PRIVATE_KEY_1,
        provider
    );
    return wallet;
}

export async function uploadViaPinata(_litActionCode: string) {
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

const getPkpInfoFromMintReceipt = async (txReceipt, litContractsClient) => {
    const pkpMintedEvent = txReceipt.events.find(
        (event) =>
            event.topics[0] ===
            "0x3b2cc0657d0387a736293d66389f78e4c8025e413c7a1ee67b7707d4418c46b8"
    );

    const publicKey = "0x" + pkpMintedEvent.data.slice(130, 260);
    const tokenId = ethers.utils.keccak256(publicKey);
    const ethAddress =
        await litContractsClient.pkpNftContract.read.getEthAddress(tokenId);

    return {
        tokenId: ethers.BigNumber.from(tokenId).toString(),
        publicKey,
        ethAddress,
    };
};

async function sessionSigEOA(_signer: ethers.Wallet, _mintedPKP: Pkp) {
    console.log("creating session sigs..");

    await litNodeClient.connect();

    const sessionSigs = await litNodeClient.getSessionSigs({
        pkpPublicKey: _mintedPKP.publicKey,
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
                walletAddress: await _signer.getAddress(),
                nonce: await litNodeClient.getLatestBlockhash(),
                litNodeClient,
                domain: "localhost:3000",
            });

            return await generateAuthSig({
                signer: _signer,
                toSign,
            });
        },
    });

    console.log("sessionSigs: ", sessionSigs);
    return sessionSigs;
}

function formatSignature(signature) {
    const encodedSig = ethers.utils.joinSignature({
        v: signature.recid,
        r: `0x${signature.r}`,
        s: `0x${signature.s}`,
    });
    return encodedSig;
}


// additional functions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// export async function depositOnChainA(_action_ipfs, _mintedPKP) {
//     _action_ipfs ? (action_ipfs = _action_ipfs) : null;
//     _mintedPKP ? (mintedPKP = _mintedPKP) : null;

//     console.log(
//         `deposit started from wallet A on chain A (${chainAParams.chain})..`
//     );
//     let wallet = await getWalletA();

//     const chainAProvider = new ethers.providers.JsonRpcProvider(
//         LIT_CHAINS[chainAParams.chain].rpcUrls[0]
//     );
//     wallet = wallet.connect(chainAProvider);

//     // sometimes you may need to add gasLimit
//     const transactionObject = {
//         to: chainAParams.tokenAddress,
//         from: await wallet.getAddress(),
//         data: generateCallData(
//             mintedPKP.ethAddress,
//             ethers.utils
//                 .parseUnits(chainAParams.amount, chainAParams.decimals)
//                 .toString()
//         ),
//     };

//     const tx = await wallet.sendTransaction(transactionObject);
//     const receipt = await tx.wait();

//     console.log("token deposit executed: ", receipt);

//     console.log("depositing some funds for gas..");

//     // gas value differs for chains, check explorer for more info
//     const transactionObject2 = {
//         to: mintedPKP.ethAddress,
//         value: ethers.BigNumber.from("1000000000000000"),
//         gasPrice: await chainAProvider.getGasPrice(),
//     };

//     const tx2 = await wallet.sendTransaction(transactionObject2);
//     const receipt2 = await tx2.wait();

//     console.log("gas deposit executed: ", receipt2);
// }

// export async function depositOnChainB(_action_ipfs, _mintedPKP) {
//     _action_ipfs ? (action_ipfs = _action_ipfs) : null;
//     _mintedPKP ? (mintedPKP = _mintedPKP) : null;

//     console.log(
//         `deposit started from wallet B on chain B (${chainBParams.chain})..`
//     );
//     let wallet = await getWalletB();

//     const chainBProvider = new ethers.providers.JsonRpcProvider(
//         LIT_CHAINS[chainBParams.chain].rpcUrls[0]
//     );
//     wallet = wallet.connect(chainBProvider);

//     const transactionObject = {
//         to: chainBParams.tokenAddress,
//         from: await wallet.getAddress(),
//         gasPrice: await chainBProvider.getGasPrice(),
//         data: generateCallData(
//             mintedPKP.ethAddress,
//             ethers.utils
//                 .parseUnits(chainBParams.amount, chainBParams.decimals)
//                 .toString()
//         ),
//     };

//     const tx = await wallet.sendTransaction(transactionObject);
//     const receipt = await tx.wait();

//     console.log("token deposit executed: ", receipt);

//     console.log("depositing some funds for gas..");

//     // gas value differs for chains, check explorer for more info
//     const transactionObject2 = {
//         to: mintedPKP.ethAddress,
//         value: ethers.BigNumber.from("100000000000000"),
//         gasPrice: await wallet.provider.getGasPrice(),
//     };

//     const tx2 = await wallet.sendTransaction(transactionObject2);
//     const receipt2 = await tx2.wait();

//     console.log("gas deposit executed: ", receipt2);
// }

// export async function checkPermits(_action_ipfs, _mintedPKP) {
//     _action_ipfs ? (action_ipfs = _action_ipfs) : null;
//     _mintedPKP ? (mintedPKP = _mintedPKP) : null;

//     console.log("checking perms..");

//     const litContracts = new LitContracts({
//         network: LitNetwork.DatilDev,
//         debug: false,
//     });
//     await litContracts.connect();

//     let permittedActions =
//         await litContracts.pkpPermissionsContract.read.getPermittedActions(
//             mintedPKP.tokenId
//         );

//     let checkGeneratedAction = await stringToBytes(action_ipfs);

//     let permittedAuthMethods =
//         await litContracts.pkpPermissionsContract.read.getPermittedAuthMethods(
//             mintedPKP.tokenId
//         );
//     let permittedAddresses =
//         await litContracts.pkpPermissionsContract.read.getPermittedAddresses(
//             mintedPKP.tokenId
//         );

//     console.log("ipfs ", action_ipfs);
//     console.log("ipfs hex ", checkGeneratedAction);
//     console.log("Actions Permissions ", permittedActions);
//     console.log("Auth methods Permissions ", permittedAuthMethods);
//     console.log("Addresses Permissions ", permittedAddresses);
// }

// export async function mintTokensOnBothChains() {
//     console.log("minting tokens on both wallets..");
//     const abi = ["function mintTo(address)"];

//     const chainAProvider = new ethers.providers.JsonRpcProvider(
//         LIT_CHAINS[chainAParams.chain].rpcUrls[0]
//     );
//     const chainBProvider = new ethers.providers.JsonRpcProvider(
//         LIT_CHAINS[chainBParams.chain].rpcUrls[0]
//     );

//     let signer_A = await getWalletA();
//     signer_A = signer_A.connect(chainAProvider);
//     const tokenContract_A = new ethers.Contract(
//         chainAParams.tokenAddress,
//         abi,
//         signer_A
//     );
//     const mint_A = await tokenContract_A.mintTo(signer_A.address);
//     // console.log("gas info on chain A", mint_A)
//     const receiptA = await mint_A.wait();
//     console.log(receiptA);

//     let signer_B = await getWalletB();
//     signer_A = signer_B.connect(chainBProvider);
//     const tokenContract_B = new ethers.Contract(
//         chainBParams.tokenAddress,
//         abi,
//         signer_B
//     );
//     const mint_B = await tokenContract_B.mintTo(signer_B.address);
//     // console.log("gas info on chain B", mint_B)
//     const receiptB = await mint_B.wait();
//     console.log(receiptB);

//     console.log("minted");
// }

// export async function getFundsStatusPKP(_action_ipfs, _mintedPKP) {
//     _action_ipfs ? (action_ipfs = _action_ipfs) : null;
//     _mintedPKP ? (mintedPKP = _mintedPKP) : null;

//     console.log("checking balances on pkp..");

//     const abi = ["function balanceOf(address) view returns (uint256)"];

//     const chainAProvider = new ethers.providers.JsonRpcProvider(
//         LIT_CHAINS[chainAParams.chain].rpcUrls[0]
//     );
//     const contract_1 = new ethers.Contract(
//         chainAParams.tokenAddress,
//         abi,
//         chainAProvider
//     );
//     const bal_1 = await contract_1.balanceOf(mintedPKP.ethAddress);
//     const balanceInTokens_1 = ethers.utils.formatUnits(
//         bal_1,
//         chainAParams.decimals
//     );

//     const chainBProvider = new ethers.providers.JsonRpcProvider(
//         LIT_CHAINS[chainBParams.chain].rpcUrls[0]
//     );
//     const contract_2 = new ethers.Contract(
//         chainBParams.tokenAddress,
//         abi,
//         chainBProvider
//     );
//     const bal_2 = await contract_2.balanceOf(mintedPKP.ethAddress);
//     const balanceInTokens_2 = ethers.utils.formatUnits(
//         bal_2,
//         chainBParams.decimals
//     );

//     console.log("balance on chain A: ", balanceInTokens_1);
//     console.log("balance on chain B: ", balanceInTokens_2);
// }

// export async function getFundsStatusWallet() {
//     console.log("checking balances on wallets..");

//     const abi = ["function balanceOf(address) view returns (uint256)"];

//     let signer_A = await getWalletA();
//     let signer_B = await getWalletB();

//     const chainAProvider = new ethers.providers.JsonRpcProvider(
//         LIT_CHAINS[chainAParams.chain].rpcUrls[0]
//     );
//     const chainBProvider = new ethers.providers.JsonRpcProvider(
//         LIT_CHAINS[chainBParams.chain].rpcUrls[0]
//     );

//     signer_A = signer_A.connect(chainAProvider);
//     const tokenContract_CA_WA = new ethers.Contract(
//         chainAParams.tokenAddress,
//         abi,
//         signer_A
//     );
//     const balance_CA_WA = ethers.utils.formatUnits(
//         await tokenContract_CA_WA.balanceOf(signer_A.address),
//         chainAParams.decimals
//     );

//     signer_B = signer_B.connect(chainAProvider);
//     const tokenContract_CA_WB = new ethers.Contract(
//         chainAParams.tokenAddress,
//         abi,
//         signer_B
//     );
//     const balance_CA_WB = ethers.utils.formatUnits(
//         await tokenContract_CA_WB.balanceOf(signer_B.address),
//         chainAParams.decimals
//     );

//     signer_A = signer_A.connect(chainBProvider);
//     const tokenContract_CB_WA = new ethers.Contract(
//         chainBParams.tokenAddress,
//         abi,
//         signer_A
//     );
//     const balance_CB_WA = ethers.utils.formatUnits(
//         await tokenContract_CB_WA.balanceOf(signer_A.address),
//         chainBParams.decimals
//     );

//     signer_B = signer_B.connect(chainBProvider);
//     const tokenContract_CB_WB = new ethers.Contract(
//         chainBParams.tokenAddress,
//         abi,
//         signer_B
//     );
//     const balance_CB_WB = ethers.utils.formatUnits(
//         await tokenContract_CB_WB.balanceOf(signer_B.address),
//         chainBParams.decimals
//     );

//     console.log(
//         `Chain A:\n${signer_A.address}, ${balance_CA_WA} ${signer_B.address}, ${balance_CA_WB}`
//     );
//     console.log(
//         `Chain B:\n${signer_A.address}, ${balance_CB_WA} ${signer_B.address}, ${balance_CB_WB}`
//     );
// }