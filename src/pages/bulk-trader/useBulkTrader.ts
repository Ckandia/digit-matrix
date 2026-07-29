const response = await api_base.api.send(req);

// Deriv resolves errors instead of throwing — this surfaces them
if (response?.error) {
    onResult?.({
        index: i,
        status: 'error',
        message: response.error.message || 'Trade rejected by Deriv.',
    });
} else {
    onResult?.({
        index: i,
        status: 'success',
        message: `Contract ${response?.buy?.contract_id ?? ''} bought`,
    });
}
