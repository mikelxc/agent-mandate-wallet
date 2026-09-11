import { AppFrame } from '../../components/app-frame';
import { CrosschainPayments } from '../../components/crosschain-payments';
import './payments.css';

export default function CrosschainPage() {
  return <AppFrame active="crosschain" network="Arc"><CrosschainPayments /></AppFrame>;
}
