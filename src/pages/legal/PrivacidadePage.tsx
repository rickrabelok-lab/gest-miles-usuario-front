import { Link } from "react-router-dom";
import { LegalShell } from "./LegalShell";

const PrivacidadePage = () => {
  return (
    <LegalShell title="Política de Privacidade" updatedAt="5 de junho de 2026">
      <p>
        Esta Política de Privacidade descreve como a{" "}
        <strong>START TECH PLATAFORMAS DIGITAIS LTDA</strong> (CNPJ 66.686.910/0001-88), responsável
        pela plataforma <strong>Gest Miles</strong>, trata os dados pessoais dos seus usuários, em
        conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — "LGPD").
      </p>

      <h2>1. Controlador e Encarregado (DPO)</h2>
      <p>
        O <strong>controlador</strong> dos dados é a START TECH PLATAFORMAS DIGITAIS LTDA, no
        endereço indicado ao final desta página. O canal do <strong>Encarregado pelo Tratamento de
        Dados Pessoais</strong> (DPO) é o e-mail{" "}
        <a href="mailto:privacidade@gestmiles.com.br">privacidade@gestmiles.com.br</a>, por onde você
        pode exercer seus direitos e tirar dúvidas.
      </p>

      <h2>2. Dados que coletamos</h2>
      <h3>2.1. Dados de cadastro e conta</h3>
      <ul>
        <li>E-mail e senha (a senha é armazenada de forma protegida/criptografada pelo provedor de autenticação, nunca em texto puro);</li>
        <li>Quando você usa "Continuar com Google", recebemos seu e-mail e nome básicos do Google.</li>
      </ul>
      <h3>2.2. Dados de perfil (quando você os informa)</h3>
      <ul>
        <li>Nome completo, CPF, RG, passaporte, data de nascimento, telefone, endereço e informações familiares.</li>
      </ul>
      <h3>2.3. Dados de uso da plataforma</h3>
      <ul>
        <li>Programas de fidelidade, saldos, vencimentos, emissões e movimentações que você registra;</li>
        <li>Preferências, simulações, demandas/cotações solicitadas;</li>
        <li>Mensagens enviadas pelo "Fale Conosco" e indicações de amigos.</li>
      </ul>
      <h3>2.4. Credenciais de programas de fidelidade</h3>
      <p>
        Caso você opte por cadastrá-las, login e senha de programas são armazenados de forma{" "}
        <strong>cifrada</strong>, acessíveis apenas pelo nosso servidor (nunca pelo navegador) e com
        registro de auditoria a cada acesso.
      </p>
      <h3>2.5. Dados técnicos</h3>
      <ul>
        <li>Dados de sessão e autenticação (cookies essenciais — ver <Link to="/cookies">Política de Cookies</Link>);</li>
        <li>Registros (logs) e dados de erros para diagnóstico e segurança.</li>
      </ul>

      <h2>3. Finalidades e bases legais</h2>
      <p>Tratamos seus dados para as seguintes finalidades, com as respectivas bases legais da LGPD:</p>
      <ul>
        <li><strong>Prestar o serviço</strong> (criar conta, autenticar, exibir e organizar seus programas e dados) — execução de contrato (art. 7º, V);</li>
        <li><strong>Comunicações operacionais</strong> (recuperação de senha, convites, respostas a contatos) — execução de contrato e legítimo interesse (art. 7º, V e IX);</li>
        <li><strong>Segurança, prevenção a fraudes e auditoria</strong> (inclusive o acesso a credenciais de programas) — legítimo interesse e cumprimento de obrigação legal (art. 7º, IX e II);</li>
        <li><strong>Melhoria e diagnóstico</strong> (monitoramento de erros e métricas de audiência agregadas, sem cookies) — legítimo interesse (art. 7º, IX);</li>
        <li><strong>Cumprimento de obrigações legais e regulatórias</strong> — art. 7º, II.</li>
      </ul>

      <h2>4. Compartilhamento e operadores</h2>
      <p>
        Não vendemos seus dados. Compartilhamos dados apenas com prestadores que atuam como{" "}
        <strong>operadores</strong>, na medida necessária para operar a plataforma:
      </p>
      <ul>
        <li><strong>Supabase</strong> — banco de dados, autenticação e armazenamento;</li>
        <li><strong>Resend</strong> — envio de e-mails transacionais;</li>
        <li><strong>Google</strong> — login via OAuth (quando você o utiliza);</li>
        <li><strong>Vercel</strong> — hospedagem da aplicação;</li>
        <li><strong>Cloudflare</strong> — rede de entrega de conteúdo (CDN) e métricas de audiência agregadas e sem cookies;</li>
        <li><strong>Sentry</strong> — monitoramento de erros;</li>
        <li><strong>Processadores de pagamento</strong> — quando houver cobrança de assinatura, limitados aos dados necessários à transação.</li>
      </ul>
      <p>
        Também poderemos compartilhar dados para cumprir obrigação legal, ordem judicial ou
        solicitação de autoridade competente.
      </p>

      <h2>5. Transferência internacional</h2>
      <p>
        Alguns operadores podem processar dados em servidores localizados fora do Brasil. Nesses
        casos, adotamos as salvaguardas exigidas pela LGPD para garantir nível adequado de proteção.
      </p>

      <h2>6. Retenção</h2>
      <p>
        Mantemos seus dados pelo tempo necessário às finalidades descritas, enquanto a sua conta
        estiver ativa, e pelos prazos exigidos por obrigações legais ou para o exercício regular de
        direitos. <strong>[A CONFIRMAR — prazos específicos de retenção, a definir com a assessoria
        jurídica.]</strong> Encerrada a conta, os dados são eliminados ou anonimizados, salvo
        hipóteses de guarda obrigatória.
      </p>

      <h2>7. Seus direitos (LGPD, art. 18)</h2>
      <p>Você pode, a qualquer momento, solicitar:</p>
      <ul>
        <li>confirmação da existência de tratamento e acesso aos seus dados;</li>
        <li>correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
        <li>portabilidade dos dados;</li>
        <li>eliminação dos dados tratados com base no consentimento;</li>
        <li>informação sobre compartilhamentos;</li>
        <li>revogação do consentimento.</li>
      </ul>
      <p>
        Para exercer esses direitos, escreva para{" "}
        <a href="mailto:privacidade@gestmiles.com.br">privacidade@gestmiles.com.br</a>.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo controle de
        acesso por linha (RLS) no banco de dados, criptografia de credenciais sensíveis, restrição
        de dados sigilosos ao servidor e registro de auditoria. Nenhum sistema é totalmente imune;
        em caso de incidente relevante, atuaremos conforme a LGPD.
      </p>

      <h2>9. Cookies</h2>
      <p>
        Utilizamos apenas cookies/armazenamento essenciais ao funcionamento. Detalhes na{" "}
        <Link to="/cookies">Política de Cookies</Link>.
      </p>

      <h2>10. Menores</h2>
      <p>
        A plataforma não é destinada a menores de 18 anos e não coletamos intencionalmente seus
        dados.
      </p>

      <h2>11. Alterações desta Política</h2>
      <p>
        Esta Política pode ser atualizada periodicamente. A versão vigente, com a data de
        atualização, estará sempre publicada nesta página.
      </p>
    </LegalShell>
  );
};

export default PrivacidadePage;
