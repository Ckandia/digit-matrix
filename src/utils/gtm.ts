// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
//
// GTM tracking has been intentionally disabled. The GTM container ID wired in here
// (and the ones in index.html) did not belong to this app's owner — meaning account
// login IDs and real trading statistics (stake, payout, profit) were being sent to
// an unverified third party's Google Tag Manager account on every bot run. All
// functions below are now safe no-ops so nothing elsewhere that calls GTM.* breaks,
// but no script is loaded and no data is ever sent anywhere.
import RootStore from '@/stores/root-store';
import { ProposalOpenContract } from '@deriv/api-types';

const GTM = (() => {
    const init = (_root_store: RootStore): void => {
        // Intentionally does nothing — see note above.
    };

    const pushDataLayer = (_data: { [key: string]: string | number | boolean; event: string }): void => {
        // Intentionally does nothing — see note above.
    };

    const onRunBot = (_login_id: string, _server_time: number, _statistics: unknown): void => {
        // Intentionally does nothing — see note above.
    };

    const onTransactionClosed = (_contract: ProposalOpenContract): void => {
        // Intentionally does nothing — see note above.
    };

    return {
        init,
        pushDataLayer,
        onTransactionClosed,
        onRunBot,
    };
})();

export default GTM;
