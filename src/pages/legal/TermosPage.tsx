import { Link } from "react-router-dom";
import { LegalShell } from "./LegalShell";

const TermosPage = () => {
  return (
    <LegalShell title="Termos de Uso" updatedAt="5 de junho de 2026">
      <p>
        Estes Termos de Uso regulam o acesso e a utilização do aplicativo e da plataforma{" "}
        <strong>Gest Miles</strong> ("Plataforma"), oferecidos por{" "}
        <strong>START TECH PLATAFORMAS DIGITAIS LTDA</strong>, inscrita no CNPJ sob o nº
        66.686.910/0001-88, com sede na Rod. Nelson Gonçalves, 498, Quadra F Lote 2, Capão Ilhas
        Resort, Capão da Canoa/RS, CEP 94.690-370 ("Gest Miles", "nós"). Ao criar uma conta ou
        utilizar a Plataforma, você ("Usuário") declara que leu, entendeu e concorda com estes
        Termos e com a nossa{" "}
        <Link to="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>1. Objeto</h2>
      <p>
        A Gest Miles é uma plataforma para gestão de programas de milhas e pontos de fidelidade,
        permitindo acompanhar saldos, vencimentos, oportunidades, promoções e organizar a sua
        carteira de programas. As informações de preços, milhas e oportunidades exibidas têm caráter
        <strong> meramente informativo e estimado</strong> e não constituem oferta, garantia de
        disponibilidade ou aconselhamento financeiro.
      </p>

      <h2>2. Cadastro e conta</h2>
      <ul>
        <li>
          Para usar a Plataforma é necessário criar uma conta com e-mail e senha, ou autenticar-se
          via Google. Você é responsável pela veracidade dos dados informados.
        </li>
        <li>
          As credenciais de acesso são pessoais e intransferíveis. Você é responsável por mantê-las
          em sigilo e por toda atividade realizada na sua conta.
        </li>
        <li>
          Você deve ser maior de 18 anos e plenamente capaz para utilizar a Plataforma.
        </li>
      </ul>

      <h2>3. Uso aceitável</h2>
      <p>Ao utilizar a Plataforma, você concorda em não:</p>
      <ul>
        <li>violar leis aplicáveis ou direitos de terceiros;</li>
        <li>
          tentar acessar áreas, dados ou contas que não lhe pertencem, ou contornar mecanismos de
          segurança;
        </li>
        <li>
          inserir conteúdo falso, ofensivo, fraudulento ou que viole regras dos programas de
          fidelidade de terceiros;
        </li>
        <li>
          utilizar a Plataforma para fins automatizados não autorizados, sobrecarga ou engenharia
          reversa.
        </li>
      </ul>

      <h2>4. Programas de terceiros</h2>
      <p>
        A Gest Miles <strong>não é afiliada, patrocinada ou operada</strong> pelos programas de
        fidelidade, companhias aéreas, bancos ou parceiros cujos dados possam ser exibidos ou
        organizados na Plataforma. O uso desses programas está sujeito às regras, prazos e condições
        próprias de cada um, sob exclusiva responsabilidade dos respectivos titulares. Você é
        responsável por conferir saldos, validade, regras e elegibilidade diretamente no programa
        antes de qualquer transação.
      </p>

      <h2>5. Credenciais de programas</h2>
      <p>
        Caso você opte por registrar credenciais de acesso a programas de fidelidade, elas são
        armazenadas de forma <strong>cifrada</strong> e tratadas conforme a{" "}
        <Link to="/privacidade">Política de Privacidade</Link>. Recomendamos o uso de senhas
        específicas e a observância das regras de cada programa.
      </p>

      <h2>6. Propriedade intelectual</h2>
      <p>
        A Plataforma, sua marca, layout, textos, código e demais elementos são de titularidade da
        Gest Miles ou de seus licenciadores, protegidos pela legislação aplicável. É vedada a
        reprodução, distribuição ou criação de obras derivadas sem autorização prévia.
      </p>

      <h2>7. Limitação de responsabilidade</h2>
      <ul>
        <li>
          A Plataforma é fornecida "no estado em que se encontra". Não garantimos disponibilidade
          ininterrupta, ausência de erros, nem a exatidão de estimativas de preços, milhas ou
          oportunidades.
        </li>
        <li>
          A Gest Miles não se responsabiliza por decisões tomadas com base nas informações exibidas,
          nem por perdas decorrentes do uso dos programas de terceiros.
        </li>
        <li>
          Na máxima extensão permitida pela legislação, nossa responsabilidade limita-se aos danos
          diretos e comprovados.
        </li>
      </ul>

      <h2>8. Suspensão e encerramento</h2>
      <p>
        Podemos suspender ou encerrar o acesso de contas que violem estes Termos ou a legislação
        aplicável. Você pode encerrar a sua conta a qualquer momento, solicitando pelo canal de
        contato.
      </p>

      <h2>9. Alterações destes Termos</h2>
      <p>
        Estes Termos podem ser atualizados a qualquer tempo. A versão vigente será sempre publicada
        nesta página, com a respectiva data de atualização. O uso continuado da Plataforma após
        alterações implica concordância com a versão revisada.
      </p>

      <h2>10. Lei aplicável e foro</h2>
      <p>
        Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da
        comarca de Capão da Canoa/RS, com renúncia a qualquer outro, ressalvado o direito do
        consumidor de eleger o foro de seu domicílio.
      </p>

      <h2>11. Contato</h2>
      <p>
        Dúvidas sobre estes Termos podem ser encaminhadas para{" "}
        <a href="mailto:privacidade@gestmiles.com.br">privacidade@gestmiles.com.br</a>.
      </p>
    </LegalShell>
  );
};

export default TermosPage;
