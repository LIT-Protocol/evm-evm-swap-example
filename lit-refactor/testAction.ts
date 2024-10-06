// @ts-nocheck

const _litActionCode = async () => {
    let response = {};
    let ipfsId = Lit.Auth.actionIpfsIds[0];
    console.log(ipfsId)

    let auth = Lit.Auth
    console.log(auth)
    // response = { ...response, ipfsId };

    // if (Array.isArray(Lit.Auth.actionIpfsIds)) {
    //     actionContext.ipfsId =
    //         Lit.Auth.actionIpfsIds[0] ?? actionContext.ipfsId;
    //     let a = actionContext.ipfsId;
    //     response = { ...response, a };
    // }
    Lit.Actions.setResponse({
        response: JSON.stringify({
            ipfsId
        }),
    });
};

export const litActionCode = `(${_litActionCode.toString()})();`;
