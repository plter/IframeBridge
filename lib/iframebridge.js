(function () {

    const Message = {
        TYPE_CALL: "call",
        TYPE_RESULT: "result",
        makeMessage: function (callId, messageType, funcName, args) {
            return {funcName: funcName, messageType: messageType, args: args, callId: callId};
        }
    };

    class IframeBridge {

        constructor(targetWindow) {
            this._targetWindow = targetWindow;
            this._funcs = new Map();
            this._callId = 1;
            this._callbacks = new Map();

            window.addEventListener("message", this.windowMessageHandler.bind(this));
        }

        windowMessageHandler(e) {
            let data = e.data;
            switch (data.messageType) {
                case Message.TYPE_CALL:
                    (async () => {
                        let func = this._funcs.get(data.funcName);
                        if (func) {
                            let result = await func.apply(null, data.args);
                            e.source.postMessage(Message.makeMessage(data.callId, Message.TYPE_RESULT, data.funcName, result), "*");
                        }
                    })();
                    break;
                case Message.TYPE_RESULT:
                    let callback = this._callbacks.get(data.callId);
                    if (callback) {
                        callback(data.args);
                        this._callbacks.delete(data.callId);
                    }
                    break;
            }
        }

        addFunc(funcName, func) {
            this._funcs.set(funcName, func);
        }

        /**
         * @param funcName
         * @param args
         * @return {Promise<any>}
         */
        callFunc(funcName, ...args) {
            return new Promise(((resolve, reject) => {

                this._callbacks.set(this._callId, function (result) {
                    resolve(result);
                });
                this._targetWindow.postMessage(Message.makeMessage(this._callId, Message.TYPE_CALL, funcName, args), "*");

                this._callId++;
            }));
        }

        static create(targetWindow) {
            return new Proxy(new IframeBridge(targetWindow), {
                get: (targetIframeBridge, p, receiver) => {
                    if (targetIframeBridge[p]) {
                        return targetIframeBridge[p];
                    } else {
                        return (function (functionName) {
                            return new Proxy(function () {
                            }.bind(targetIframeBridge), {
                                apply: async (target1, thisArg, argArray) => {
                                    argArray.splice(0, 0, functionName);
                                    return await targetIframeBridge.callFunc.apply(targetIframeBridge, argArray);
                                }
                            })
                        })(p);
                    }
                },
                set: (target, p, value, receiver) => {
                    target.addFunc(p, value);
                }
            });
        }
    }

    window.IframeBridge = IframeBridge;

})();