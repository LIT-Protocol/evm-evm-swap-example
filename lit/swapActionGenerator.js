import { ethers } from "ethers";

export function createERC20SwapLitAction(
    chainAParams,
    chainBParams,
) {
    if (chainAParams.chain === chainBParams.chain) {
        throw new Error("Swap must be cross chain, same chains not supported");
    }

    const originTime = Date.now()

    const chainACondition = generateERC20SwapCondition(chainAParams);
    const chainBCondition = generateERC20SwapCondition(chainBParams);

    const chainATransaction = generateUnsignedERC20Transaction(
        Object.assign(Object.assign({}, chainAParams), {
            to: chainBParams.to,
        })
    );
    const chainBTransaction = generateUnsignedERC20Transaction(
        Object.assign(Object.assign({}, chainBParams), {
            to: chainAParams.to,
        })
    );

    const chainAClawbackTransaction = generateUnsignedERC20Transaction(
        Object.assign({}, chainAParams)
    );
    const chainBClawbackTransaction = generateUnsignedERC20Transaction(
        Object.assign({}, chainBParams)
    );

    const action = generateERC20SwapLitActionCode(
        chainACondition,
        chainBCondition,
        chainATransaction,
        chainBTransaction,
        chainAClawbackTransaction,
        chainBClawbackTransaction,
        originTime
    );

    return action;
}

function generateERC20SwapCondition(conditionParams) {
    return {
        conditionType: "evmBasic",
        contractAddress: conditionParams.tokenAddress,
        standardContractType: "ERC20",
        chain: conditionParams.chain,
        method: "balanceOf",
        parameters: ["address"],
        returnValueTest: {
            comparator: ">=",
            value: ethers.BigNumber.from(conditionParams.amount)
                .mul(
                    ethers.BigNumber.from(10).pow(
                        ethers.BigNumber.from(conditionParams.decimals)
                    )
                )
                .toString(),
        },
    };
}

        // chainId: LIT_CHAINS[transactionParams.chain],
        // chainId: transactionParams.chain,
        // nonce: transactionParams.nonce ? transactionParams.nonce : 0,
function generateUnsignedERC20Transaction(transactionParams) {
    return {
        to: transactionParams.tokenAddress,
        gasLimit: "60000",
        from: transactionParams.from
            ? transactionParams.from
            : "{{pkpPublicKey}}",
        data: generateCallData(
            transactionParams.to,
            ethers.utils
                .parseUnits(
                    transactionParams.amount,
                    transactionParams.decimals
                )
                .toString()
        ),
        type: 2,
    };
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

function generateERC20SwapLitActionCode(
    chainACondition,
    chainBCondition,
    chainATransaction,
    chainBTransaction,
    chainAClawbackTransaction,
    chainBClawbackTransaction,
    originTime
) {
    return `const go = async () => {
      
    const originTime = ${JSON.stringify(originTime)} ? ${JSON.stringify(
        originTime
    )} : Date.now();
    const chainACondition = ${JSON.stringify(chainACondition)}
    const chainBCondition = ${JSON.stringify(chainBCondition)}
    let chainATransaction = ${JSON.stringify(chainATransaction)}
    let chainBTransaction = ${JSON.stringify(chainBTransaction)}
    let chainAClawbackTransaction = ${JSON.stringify(chainAClawbackTransaction)}
    let chainBClawbackTransaction = ${JSON.stringify(chainBClawbackTransaction)}

    const hashTransaction = (tx) => {
      return ethers.utils.arrayify(
        ethers.utils.keccak256(
          ethers.utils.arrayify(ethers.utils.serializeTransaction(tx)),
        ),
      );
    }

    function checkHasThreeDaysPassed(previousTime) {
        const currentTime = Date.now();
        const difference = currentTime - previousTime;
        return difference / (1000 * 3600 * 24) >= 3 ? true : false;
    }

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
      Lit.Actions.setResponse({
        response: JSON.stringify({ chainATransaction, chainBTransaction }),
      });
    };
    
    chainATransaction.from = chainBTransaction.from = pkpAddress;

    chainATransaction = {...chainATransaction, ...chainAGasConfig}
    chainBTransaction = {...chainBTransaction, ...chainBGasConfig}
    chainAClawbackTransaction = {...chainAClawbackTransaction, ...chainAGasConfig}
    chainBClawbackTransaction = {...chainBClawbackTransaction, ...chainBGasConfig}

    chainACondition.parameters = chainBCondition.parameters = [
      pkpAddress,
    ];
    
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
  
    if (chainAConditionsPass && chainBConditionsPass) {
      await generateSwapTransactions();
      return;
    }
  
    const threeDaysHasPassed = checkHasThreeDaysPassed(originTime);
    const chainANonce = await Lit.Actions.getLatestNonce({address: pkpAddress, chain: chainACondition.chain});
    const chainBNonce = await Lit.Actions.getLatestNonce({address: pkpAddress, chain: chainBCondition.chain});

    if (chainAConditionsPass) {
      if (chainBNonce === "0x1") {
        await generateSwapTransactions();
        return;
      }
      if (!threeDaysHasPassed) {
        Lit.Actions.setResponse({ response: "Conditions for swap not met!" });
        return;
      }
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
      if (chainANonce === "0x1") {
        await generateSwapTransactions();
        return;
      }
      if (!threeDaysHasPassed) {
        Lit.Actions.setResponse({ response: "Conditions for swap not met!" });
        return;
      }
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
    Lit.Actions.setResponse({ response: "Conditions for swap not met!" });
  }
go();`;
}