`
const go = async () => {
    const chainACondition = {"conditionType":"evmBasic","contractAddress":"0xad50f302a957C165d865eD398fC3ca5A5A2cDA85","standardContractType":"ERC20","chain":"baseSepolia","method":"balanceOf","parameters":["address"],"returnValueTest":{"comparator":">=","value":"4000000000000000000"}}
    const chainBCondition = {"conditionType":"evmBasic","contractAddress":"0x2dcA1a80c89c81C37efa7b401e2d20c1ED99C72F","standardContractType":"ERC20","chain":"yellowstone","method":"balanceOf","parameters":["address"],"returnValueTest":{"comparator":">=","value":"8000000000000000000"}}
    let chainATransaction = {"to":"0xad50f302a957C165d865eD398fC3ca5A5A2cDA85","gasLimit":"60000","from":"0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB","data":"0xa9059cbb000000000000000000000000291b0e3aa139b2bc9ebd92168575b5c6bad5236c0000000000000000000000000000000000000000000000003782dace9d900000","type":2}
    let chainBTransaction = {"to":"0x2dcA1a80c89c81C37efa7b401e2d20c1ED99C72F","gasLimit":"60000","from":"0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C","data":"0xa9059cbb00000000000000000000000048e6a467852fa29710aaacdb275f85db4fa420eb0000000000000000000000000000000000000000000000006f05b59d3b200000","type":2}
    let chainAClawbackTransaction = {"to":"0xad50f302a957C165d865eD398fC3ca5A5A2cDA85","gasLimit":"60000","from":"0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB","data":"0xa9059cbb00000000000000000000000048e6a467852fa29710aaacdb275f85db4fa420eb0000000000000000000000000000000000000000000000003782dace9d900000","type":2}
    let chainBClawbackTransaction = {"to":"0x2dcA1a80c89c81C37efa7b401e2d20c1ED99C72F","gasLimit":"60000","from":"0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C","data":"0xa9059cbb000000000000000000000000291b0e3aa139b2bc9ebd92168575b5c6bad5236c0000000000000000000000000000000000000000000000006f05b59d3b200000","type":2}

    chainATransaction.from = chainBTransaction.from = pkpAddress;

    chainACondition.parameters = chainBCondition.parameters = [pkpAddress];

    chainATransaction = { ...chainATransaction, ...chainAGasConfig };
    chainBTransaction = { ...chainBTransaction, ...chainBGasConfig };
    chainAClawbackTransaction = {
        ...chainAClawbackTransaction,
        ...chainAGasConfig,
    };
    chainBClawbackTransaction = {
        ...chainBClawbackTransaction,
        ...chainBGasConfig,
    };

    const chainAConditionsPass = await Lit.Actions.checkConditions({
        conditions: [chainACondition],
        authSig: JSON.parse(authSig),
        chain: chainACondition.chain,
    });

    const chainBConditionsPass = await Lit.Actions.checkConditions({
        conditions: [chainBCondition],
        authSig: JSON.parse(authSig),
        chain: chainBCondition.chain,
    });

    console.log(
        "chainAConditionsPass: ",
        chainAConditionsPass,
        "chainBConditionsPass: ",
        chainBConditionsPass
    );

    const hashTransaction = (tx) => {
        return ethers.utils.arrayify(
            ethers.utils.keccak256(
                ethers.utils.arrayify(ethers.utils.serializeTransaction(tx))
            )
        );
    };

    const generateSwapTransactions = async () => {
        await LitActions.signEcdsa({
            toSign: hashTransaction(chainATransaction),
            publicKey: pkpPublicKey,
            sigName: "chainASignature",
        });
        await LitActions.signEcdsa({
            toSign: hashTransaction(chainBTransaction),
            publicKey: pkpPublicKey,
            sigName: "chainBSignature",
        });

        if (chainAConditionsPass && chainBConditionsPass) {
            await generateSwapTransactions();
            return;
        }

        if (chainAConditionsPass) {
            await Lit.Actions.signEcdsa({
                toSign: hashTransaction(chainAClawbackTransaction),
                publicKey: pkpPublicKey,
                sigName: "chainASignature",
            });
            Lit.Actions.setResponse({
                response: JSON.stringify({
                    chainATransaction: chainAClawbackTransaction,
                }),
            });
            return;
        }

        if (chainBConditionsPass) {
            await Lit.Actions.signEcdsa({
                toSign: hashTransaction(chainBClawbackTransaction),
                publicKey: pkpPublicKey,
                sigName: "chainBSignature",
            });
            Lit.Actions.setResponse({
                response: JSON.stringify({
                    chainBTransaction: chainBClawbackTransaction,
                }),
            });
            return;
        }

        Lit.Actions.setResponse({
            response: JSON.stringify({ chainATransaction, chainBTransaction }),
        });
    };

    Lit.Actions.setResponse({ response: "Conditions for swap not met!" });
};
go();
`