import { Link } from "react-router-dom";
import { LegalShell } from "./LegalShell";

const CookiesPage = () => {
  return (
    <LegalShell title="Política de Cookies" updatedAt="5 de junho de 2026">
      <p>
        Esta Política de Cookies explica como a plataforma <strong>Gest Miles</strong> (START TECH
        PLATAFORMAS DIGITAIS LTDA, CNPJ 66.686.910/0001-88) utiliza cookies e tecnologias de
        armazenamento no seu navegador. Ela complementa a nossa{" "}
        <Link to="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>1. O que são cookies</h2>
      <p>
        Cookies e tecnologias semelhantes (como o armazenamento local do navegador) são pequenos
        arquivos/registros usados para guardar informações no seu dispositivo, por exemplo, para
        manter você conectado entre páginas.
      </p>

      <h2>2. Quais utilizamos</h2>
      <p>
        Utilizamos <strong>apenas cookies e armazenamento essenciais</strong> ao funcionamento da
        plataforma:
      </p>
      <ul>
        <li>
          <strong>Sessão e autenticação:</strong> mantêm você logado com segurança e preservam a sua
          sessão (geridos pelo nosso provedor de autenticação).
        </li>
        <li>
          <strong>Preferências essenciais:</strong> pequenas marcações locais, como lembrar que você
          já fechou o aviso de cookies, para não exibi-lo novamente.
        </li>
      </ul>
      <p>
        <strong>Não utilizamos</strong> cookies de publicidade, de rastreamento entre sites, nem
        ferramentas de analytics de comportamento.
      </p>

      <h2>3. Base legal</h2>
      <p>
        Por serem estritamente necessários ao funcionamento do serviço que você solicitou, esses
        cookies essenciais não dependem de consentimento prévio, conforme a LGPD. Esta página tem
        caráter informativo.
      </p>

      <h2>4. Como gerenciar</h2>
      <p>
        Você pode bloquear ou apagar cookies nas configurações do seu navegador. Note que, por serem
        essenciais, bloqueá-los pode impedir o login e o funcionamento adequado da plataforma.
      </p>

      <h2>5. Alterações</h2>
      <p>
        Caso passemos a utilizar cookies não essenciais (por exemplo, de análise), esta página será
        atualizada e, quando exigido, solicitaremos o seu consentimento previamente.
      </p>

      <h2>6. Contato</h2>
      <p>
        Dúvidas podem ser enviadas para{" "}
        <a href="mailto:privacidade@gestmiles.com.br">privacidade@gestmiles.com.br</a>.
      </p>
    </LegalShell>
  );
};

export default CookiesPage;
