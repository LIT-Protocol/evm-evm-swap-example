// @ts-nocheck
const _litActionCode = async () => {
    const getSwapObjectHashString = (swapObject) => {
        const sortedSwapString = JSON.stringify(
            Object.keys(swapObject)
                .sort()
                .reduce((obj, key) => {
                    obj[key] = swapObject[key];
                    return obj;
                }, {})
        );

        return ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes(sortedSwapString)
        );
    };

    const checkIfUserAuthorizedSwap = async (swapObjectHash, userAuthSig) => {
        console.log("swapObjectHash: ", swapObjectHash);
        // console.log("userAuthSig: ", userAuthSig);
        const conditionForAuthSwap = {
            contractAddress: "",
            standardContractType: "SIWE",
            chain: "ethereum",
            method: "",
            parameters: [":statement"],
            returnValueTest: {
                comparator: "=",
                value: swapObjectHash,
            },
        };
        const conditionPass = await Lit.Actions.checkConditions({
            conditions: [conditionForAuthSwap],
            authSig: JSON.parse(userAuthSig),
            chain: "ethereum",
        });

        return conditionPass
    };

    const generateKeyAndEncrypt = async (swapObject) => {
        const privateKeyA = ethers.utils.ethers.Wallet.createRandom();
        const walletA = new ethers.Wallet(privateKeyA);
        const swapAddressA = walletA.address;
        const privateKeyB = ethers.utils.ethers.Wallet.createRandom();
        const walletB = new ethers.Wallet(privateKeyB);
        const swapAddressB = walletB.address;
        const dataToEncrypt = JSON.stringify({
            privateKeyA,
            privateKeyB,
            swapObject,
        });
        const chain = "yellowstone";
        const accessControlConditions = getLitSwapActionCondition();
        const { ciphertext, dataToEncryptHash } = await Lit.Actions.encrypt({
            accessControlConditions,
            dataToEncrypt,
        });
        const encryptionMetadata = {
            ciphertext,
            dataToEncryptHash,
        };
        return { swapAddressA, swapAddressB, encryptionMetadata };
    };

    const decryptsMetadata = async (encryptionMetadata) => {
        const accessControlConditions = getLitSwapActionCondition();
        const ciphertext = encryptionMetadata.ciphertext;
        const dataToEncryptHash = encryptionMetadata.dataToEncryptHash;
        const chain = "yellowstone";
        const encryptedData = await Lit.Actions.decryptToSingleNode({
            accessControlConditions,
            ciphertext,
            dataToEncryptHash,
            authSig,
            chain,
        });
        return encryptedData;
    };

    const checkUserFundedPkp = async (encryptedData, isUserA) => {
        const user = isUserA ? "A" : "B";
        const swapObject = encryptedData.swapObject;
        const privateKey = isUserA
            ? encryptedData.privateKeyA
            : encryptedData.privateKeyB;
        const provider = new ethers.providers.JsonRpcProvider(
            LIT_CHAINS[swapObject.chainA].rpcUrls[0]
        );
        const wallet = new ethers.Wallet(privateKey, provider);
        const userAddress = await wallet.getAddress();

        let isFunded = false;
        if (swapObject.currencyAType === "NATIVE") {
            const balance = await provider.getBalance(userAddress);
            if (
                balance.gte(
                    ethers.utils.parseUnits(
                        swapObject.amountA.toString(),
                        "ether"
                    )
                )
            ) {
                isFunded = true;
            }
        } else if (swapObject.currencyAType === "ERC20") {
            const erc20Contract = new ethers.Contract(
                swapObject.tokenAddress,
                erc20Abi,
                provider
            );
            const balance = await erc20Contract.balanceOf(userAddress);
            if (
                balance.gte(
                    ethers.utils.parseUnits(
                        swapObject.amountA.toString(),
                        swapObject.tokenDecimals
                    )
                )
            ) {
                isFunded = true;
            }
        }
        return isFunded;
    };

    const generateEncryptedKeyForUser = async (encryptedData, user) => {
        const swapObject = encryptedData.swapObject;
        const privateKey =
            user == "A" ? encryptedData.privateKeyA : encryptedData.privateKeyB;
        const wallet = new ethers.Wallet(privateKey);
        const accessControlConditions = getKeyForUserCondition(
            swapObject,
            user
        );
        const { ciphertext, dataToEncryptHash } = await Lit.Actions.encrypt({
            accessControlConditions,
            privateKey,
        });
        const encryptionMetadata = {
            ciphertext,
            dataToEncryptHash,
        };
        return encryptionMetadata;
    };

    const getLitSwapActionCondition = () => {
        const currentActionIpfsId = Lit.Auth.actionIpfsIds[0];
        const accessControlConditions = [
            {
                contractAddress: "",
                standardContractType: "",
                chain: "yellowstone",
                method: "",
                parameters: [":currentActionIpfsId"],
                returnValueTest: {
                    comparator: "=",
                    value: currentActionIpfsId,
                },
            },
        ];

        return accessControlConditions;
    };

    const getKeyForUserCondition = (swapObject, user) => {
        if (swapObject[`currency${user}Type`] === "NATIVE") {
            const accessControlConditions = {
                contractAddress: "",
                standardContractType: "",
                chain,
                method: "eth_getBalance",
                parameters: [":userAddress", "latest"],
                returnValueTest: {
                    comparator: ">=",
                    value: swapObject[`amount${user}`],
                },
            };
            return accessControlConditions;
        } else {
            const accessControlConditions = {
                conditionType: "evmBasic",
                contractAddress: swapObject[`contract${user}`],
                standardContractType: "ERC20",
                chain: swapObject[`chain${user}`],
                method: "balanceOf",
                parameters: [wallet.address],
                returnValueTest: {
                    comparator: ">=",
                    value: swapObject[`amount${user}`],
                },
            };
            return accessControlConditions;
        }
    };

    enum Flags {
        Generate = "generate",
        Execute = "execute",
    }

    if (flag == Flags.Generate) {
        const swapObjectHash = getSwapObjectHashString(swapObject);

        const userAAuthorizedSwap = await checkIfUserAuthorizedSwap(
            swapObjectHash,
            userAAuthSig
        );
        console.log("userAAuthorizedSwap", userAAuthorizedSwap);
        if (!userAAuthorizedSwap)
            return Lit.Actions.setResponse({
                response:
                    "userAAuthSig does not authorize provided swap object",
            });

        const userBAuthorizedSwap = await checkIfUserAuthorizedSwap(
            swapObjectHash,
            userBAuthSig
        );
        if (!userBAuthorizedSwap)
            return Lit.Actions.setResponse({
                response:
                    "userBAuthSig does not authorize provided swap object",
            });

        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (swapObjectHash.expirationA >= currentTimestamp)
            return Lit.Actions.setResponse({
                response: "expirationA has passed, swap no longer valid",
            });
        if (swapObjectHash.expirationB >= currentTimestamp)
            return Lit.Actions.setResponse({
                response: "expirationB has passed, swap no longer valid",
            });

        const { swapAddressA, swapAddressB, encryptionMetadata } =
            await generateKeyAndEncrypt(swapObject);
        Lit.Actions.setResponse({
            response: JSON.stringify({
                swapAddressA,
                swapAddressB,
                encryptionMetadata,
            }),
        });
    }

    if (flag == Flags.Execute) {
        try {
            const encryptedData = await decryptsMetadata(encryptionMetadata);
            const currentTimestamp = Math.floor(Date.now() / 1000);

            if (
                encryptedData.swapObject.expirationA >= currentTimestamp ||
                encryptedData.swapObject.expirationB >= currentTimestamp
            ) {
                // Re-encrypt the keys as clawback
                const encryptKeyUserA = await generateEncryptedKeyForUser(
                    encryptedData,
                    "A"
                );
                const encryptKeyUserB = await generateEncryptedKeyForUser(
                    encryptedData,
                    "B"
                );

                Lit.Actions.setResponse({
                    response: JSON.stringify({
                        encryptKeyUserA,
                        encryptKeyUserB,
                    }),
                });
            } else {
                const userAFundedPkp = await checkUserFundedPkp(
                    encryptedData,
                    true
                );

                if (!userAFundedPkp)
                    return Lit.Actions.setResponse({
                        response: "userA did not fund pkp",
                    });

                const userBFundedPkp = await checkUserFundedPkp(
                    encryptedData,
                    false
                );

                if (!userBFundedPkp)
                    return Lit.Actions.setResponse({
                        response: "userB did not fund pkp",
                    });

                // Re-encrypt the keys by swapping them
                const encryptKeyUserA = await generateEncryptedKeyForUser(
                    encryptedData,
                    "B"
                );
                const encryptKeyUserB = await generateEncryptedKeyForUser(
                    encryptedData,
                    "A"
                );

                Lit.Actions.setResponse({
                    response: JSON.stringify({
                        encryptKeyUserA,
                        encryptKeyUserB,
                    }),
                });
            }
        } catch (error) {
            Lit.Actions.setResponse({
                response: JSON.stringify({
                    error: `Swap failed: ${error.message}`,
                }),
            });
        }
    }
};

export const litActionCode = `(${_litActionCode.toString()})();`;

// params for flag=generate, swapObject, userAAuthSig, userBAuthSig, pkpAddress, pkpPublicKey
// params for flag=execute, encryptionMetadata, pkpAddress, pkpPublicKey
