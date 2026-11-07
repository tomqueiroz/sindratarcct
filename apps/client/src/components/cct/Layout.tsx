import { type ReactNode, useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import "./service.css";

export function PageMeta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = `${title} | SINDRATAR-SP`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  }, [title, description]);
  return null;
}
export function Layout({ children }: { children: ReactNode }) {
  return <div className="sdr">
    <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <div className="topline"><div className="wrap"><span>SINDICATO PATRONAL DO SETOR AVACR</span><a href="https://sindratarsp.com.br/" target="_blank" rel="noopener noreferrer">Visitar o site institucional ↗</a></div></div>
    <header className="site-header"><div className="wrap header-inner">
      <Link to="/" className="header-brand" aria-label="SINDRATAR-SP — central de convenções"><img data-image-slot="brand.header" src="/assets/slots/brand.header.png" width="230" height="32" alt="SINDRATAR-SP" /></Link>
      <nav aria-label="Navegação principal">
        <a href="https://sindratarsp.com.br/" target="_blank" rel="noopener noreferrer">Site institucional ↗</a>
        <NavLink to="/" end>Solicitar CCT</NavLink>
        <NavLink to="/como-funciona">Como funciona</NavLink>
        <a href="https://sindratarsp.com.br/contato/" target="_blank" rel="noopener noreferrer">Ajuda ↗</a>
      </nav>
    </div></header>
    <main id="conteudo">{children}</main>
    <footer className="footer"><div className="wrap footer-top">
      <div><div className="footer-logo-frame"><img data-image-slot="brand.footer" src="/assets/slots/brand.footer.png" width="300" height="169" alt="SINDRATAR-SP" className="footer-logo" /></div><p>Sindicato da Indústria de Refrigeração,<br />Aquecimento e Tratamento de Ar<br />do Estado de São Paulo.</p></div>
      <div><h3>Nosso endereço</h3><p>Avenida Paulista, 1.313<br />4º andar · Conjunto 470<br />Cerqueira César · São Paulo – SP<br />CEP 01311-923</p><a href="https://sindratarsp.com.br/contato/" target="_blank" rel="noopener noreferrer">Falar com a equipe ↗</a></div>
      <div><h3>Central de convenções</h3><Link to="/como-funciona">Como solicitar</Link><Link to="/gestao">Acesso da equipe</Link><a href="/entrega/pagina-cct-servico.html" target="_blank" rel="noopener noreferrer">Versão HTML para integração ↗</a></div>
    </div><div className="wrap footer-bottom"><span>© 2026 SINDRATAR-SP. Página de homologação.</span><span>Dados de exemplo · Nenhuma cobrança real</span></div></footer>
  </div>;
}
