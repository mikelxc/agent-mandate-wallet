import { AppFrame } from '../../components/app-frame';
import { PortableIdentityPanel } from '../../components/portable-identity';
export default function IdentityPage() {
    const gatewayAudience = process.env.MANDATE_GATEWAY_ORIGIN ??
        (process.env.NODE_ENV === 'development' && !process.env.TURSO_DATABASE_URL ? 'http://127.0.0.1:3001' : undefined);
    return <AppFrame active="identity"><PortableIdentityPanel gatewayAudience={gatewayAudience}/></AppFrame>;
}
