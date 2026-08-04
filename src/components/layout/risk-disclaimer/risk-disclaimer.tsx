// Floating "Risk" button shown site-wide (fixed bottom-left). Opens a modal with
// Deriv's required third-party risk disclosure. Reuses the existing shared Modal —
// no separate modal implementation.
import { useState } from 'react';
import Modal from '@/components/shared_ui/modal';
import Text from '@/components/shared_ui/text';
import { Localize } from '@deriv-com/translations';
import './risk-disclaimer.scss';

const RiskDisclaimer = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                type='button'
                className='risk-disclaimer__trigger'
                onClick={() => setIsOpen(true)}
                aria-label='Risk disclaimer'
            >
                <span className='risk-disclaimer__icon' aria-hidden='true'>
                    ⚠
                </span>
                <span className='risk-disclaimer__label'>
                    <Localize i18n_default_text='Risk' />
                </span>
            </button>

            <Modal
                is_open={isOpen}
                toggleModal={() => setIsOpen(false)}
                title={<Localize i18n_default_text='Risk Controls' />}
                width='420px'
                has_close_icon
            >
                <Modal.Body>
                    <Text size='xs' weight='bold' className='risk-disclaimer__section-title'>
                        <Localize i18n_default_text='Risk Disclaimer' />
                    </Text>
                    <div className='risk-disclaimer__box'>
                        <Text size='xs'>
                            <Localize i18n_default_text='Deriv offers complex derivatives, such as options and contracts for difference ("CFDs"). These products may not be suitable for all clients, and trading them puts you at risk. Please make sure that you understand the risks before trading Deriv products.' />
                        </Text>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <button
                        type='button'
                        className='risk-disclaimer__done-btn'
                        onClick={() => setIsOpen(false)}
                    >
                        <Localize i18n_default_text='Done' />
                    </button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default RiskDisclaimer;
