const executeBulkTrades = useCallback(async (
    mode: TradeExecutionMode,
    count: number,
    tradeParams: any
): Promise<BulkExecutionResult> => {
    const result: BulkExecutionResult = {
        successCount: 0,
        failureCount: 0,
        totalProcessed: 0,
        errors: [],
    };

    const activeApi = api_base.api;
    if (!activeApi) {
        result.errors.push('Main API connection not available.');
        return result;
    }

    const delay = mode === 'FAST' ? 50 : 300;

    for (let i = 0; i < count; i++) {
        await new Promise<void>((resolve) => {
            setTimeout(async () => {
                try {
                    // Step 1: Build the proposal request (this is where symbol/contract_type/etc belong)
                    const proposalReq: any = {
                        proposal: 1,
                        amount: tradeParams.amount,
                        basis: 'stake',
                        contract_type: tradeParams.contract_type,
                        currency: accountInfo.currency || 'USD',
                        duration: tradeParams.duration,
                        duration_unit: 't',
                        symbol: tradeParams.symbol,
                    };

                    if (tradeParams.prediction !== undefined) {
                        proposalReq.barrier = String(tradeParams.prediction);
                    }

                    console.log(`[BulkTrader] Requesting proposal #${i + 1}`, proposalReq);
                    const proposalResponse = await activeApi.send(proposalReq);
                    console.log(`[BulkTrader] Proposal #${i + 1} response:`, proposalResponse);

                    if (proposalResponse?.error) {
                        result.failureCount++;
                        result.errors.push(proposalResponse.error.message || `Proposal ${i + 1} failed`);
                        result.totalProcessed++;
                        resolve();
                        return;
                    }

                    const proposalId = proposalResponse?.proposal?.id;
                    const askPrice = proposalResponse?.proposal?.ask_price;

                    if (!proposalId) {
                        result.failureCount++;
                        result.errors.push(`Proposal ${i + 1} returned no id`);
                        result.totalProcessed++;
                        resolve();
                        return;
                    }

                    // Step 2: Buy using the proposal id
                    const buyReq: any = {
                        buy: proposalId,
                        price: askPrice ?? tradeParams.amount,
                    };

                    if (accountInfo.loginid) {
                        buyReq.passthrough = { loginid: accountInfo.loginid };
                    }

                    console.log(`[BulkTrader] Firing buy #${i + 1}`, buyReq);
                    const buyResponse = await activeApi.send(buyReq);
                    console.log(`[BulkTrader] Buy #${i + 1} response:`, buyResponse);

                    if (buyResponse?.error) {
                        result.failureCount++;
                        result.errors.push(buyResponse.error.message || `Trade ${i + 1} failed`);
                    } else {
                        result.successCount++;
                    }
                } catch (err: any) {
                    console.error(`[BulkTrader] Trade #${i + 1} failed:`, err);
                    result.failureCount++;
                    result.errors.push(err?.message || `Trade ${i + 1} execution error`);
                }
                result.totalProcessed++;
                resolve();
            }, i * delay);
        });
    }

    return result;
}, [accountInfo]);
