# Brazil LGPD: default consent preset research

Date: 2026-10-07. Purpose: choose the default policy for visitors in Brazil.

Labels used below:
- VERIFIED: I opened the primary source or the vendor's own page and read the text.
- UNVERIFIED: not opened, blocked, or not stated in the source. Treat as unknown.

Source files read: LGPD compiled text, `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm`. ANPD guide, version 1.0, October 2022, `https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf` (PDF file at the `/@@download/file` suffix of that URL). The guide is cited by section heading because I could not map every sentence to a page number reliably. The guide describes itself as "um guia de boas práticas" (Considerações finais), so it is not binding law.

## Part 1. The law and the regulator

### 1.1 LGPD (Lei 13.709/2018)

| # | Point | Article | Verbatim quote | Status |
|---|---|---|---|---|
| 1 | Personal data | Art. 5, I | "informação relacionada a pessoa natural identificada ou identificável" | VERIFIED |
| 2 | Consent defined | Art. 5, XII | "manifestação livre, informada e inequívoca pela qual o titular concorda com o tratamento de seus dados pessoais para uma finalidade determinada" | VERIFIED |
| 3 | Consent is one legal basis | Art. 7, I | "mediante o fornecimento de consentimento pelo titular" | VERIFIED |
| 4 | Legitimate interest is another | Art. 7, IX | "quando necessário para atender aos interesses legítimos do controlador ou de terceiro, exceto no caso de prevalecerem direitos e liberdades fundamentais do titular que exijam a proteção dos dados pessoais" | VERIFIED |
| 5 | Form of consent | Art. 8, caput | "deverá ser fornecido por escrito ou por outro meio que demonstre a manifestação de vontade do titular" | VERIFIED |
| 6 | Burden of proof | Art. 8, § 2º | "Cabe ao controlador o ônus da prova de que o consentimento foi obtido em conformidade com o disposto nesta Lei." | VERIFIED |
| 7 | Vitiated consent | Art. 8, § 3º | "É vedado o tratamento de dados pessoais mediante vício de consentimento." | VERIFIED |
| 8 | Purpose-bound | Art. 8, § 4º | "O consentimento deverá referir-se a finalidades determinadas, e as autorizações genéricas para o tratamento de dados pessoais serão nulas." | VERIFIED |
| 9 | Withdrawal | Art. 8, § 5º | "O consentimento pode ser revogado a qualquer momento mediante manifestação expressa do titular, por procedimento gratuito e facilitado" | VERIFIED |
| 10 | Changed terms | Art. 8, § 6º | "o controlador deverá informar ao titular, com destaque de forma específica do teor das alterações, podendo o titular, nos casos em que o seu consentimento é exigido, revogá-lo caso discorde da alteração" | VERIFIED |
| 11 | Information duty | Art. 9, caput | "de forma clara, adequada e ostensiva" | VERIFIED |
| 12 | Children, best interest | Art. 14, caput | "O tratamento de dados pessoais de crianças e de adolescentes deverá ser realizado em seu melhor interesse" | VERIFIED |
| 13 | Children, consent | Art. 14, § 1º | "O tratamento de dados pessoais de crianças deverá ser realizado com o consentimento específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal." | VERIFIED |
| 14 | Deletion after processing | Art. 16, caput | "Os dados pessoais serão eliminados após o término de seu tratamento" | VERIFIED |
| 15 | Right to revoke | Art. 18, IX | "revogação do consentimento, nos termos do § 5º do art. 8º desta Lei" | VERIFIED |

URL for all rows: the Planalto URL above.

Points the LGPD text does not settle:
- IP address as personal data: the word "endereço" does not appear in the text I searched. Art. 5, I (row 1) is the only test. Not found in a primary source as an explicit statement. UNVERIFIED.
- A consent expiry or re-consent period: not found in the LGPD text. UNVERIFIED.
- Art. 8 does not use the words "pre-ticked", "scrolling" or "reject button". Those come from the ANPD guide below.

### 1.2 ANPD guide, "Guia Orientativo Cookies e Proteção de Dados Pessoais" (out/2022, v1.0)

| # | Point | Section in guide | Verbatim quote | Status |
|---|---|---|---|---|
| 16 | Cookies can be personal data | Conceito e classificações, O que são cookies? | "as informações pessoais coletadas por meio de cookies podem ser consideradas dados pessoais, cujo tratamento é regulado pela lgpd" | VERIFIED |
| 17 | Categories used | Categorias de cookies | "(i) a entidade responsável pela sua gestão; (ii) a necessidade; (iii) a finalidade; e (iv) o período de retenção das informações" | VERIFIED |
| 18 | Purpose categories | Categorias, cookies de acordo com a finalidade | analíticos ou de desempenho (e), de funcionalidade (f), de publicidade (g). Necessity axis: "Cookies necessários" (c) and "Cookies não necessários" (d). | VERIFIED |
| 19 | Non-necessary cookies: consent | Hipóteses legais, consentimento | "o recurso ao consentimento será mais apropriado quando a coleta de informações for realizada por cookies não necessários" | VERIFIED |
| 20 | No hierarchy of bases | same | "inexista hierarquia ou preferência entre as hipóteses legais previstas na lgpd" | VERIFIED |
| 21 | Strictly necessary: not consent | same | "não é apropriado utilizar a hipótese legal do consentimento nas hipóteses de cookies estritamente necessários" and "o legítimo interesse poderá ser a hipótese legal apropriada nos casos de utilização de cookies estritamente necessários" | VERIFIED |
| 22 | Analytics may rest on legitimate interest | Hipóteses legais, legítimo interesse | "A utilização de cookies para fins de medição de audiência (cookies analíticos ou de medição) pode ser amparada na hipótese legal do legítimo interesse em determinados contextos". Conditions given: aggregated data, no combination with other tracking, no profiling (Exemplo 4 repeats them, plus no sharing with third parties and an opposition option). | VERIFIED |
| 23 | Advertising: legitimate interest unlikely | same | "o legítimo interesse dificilmente será a hipótese legal mais apropriada nas hipóteses em que os dados coletados por meio de cookies são utilizados para fins de publicidade" | VERIFIED |
| 24 | Free consent, no forced consent | consentimento | "não é compatível com a lgpd a obtenção “forçada” do consentimento, isto é, de forma condicionada ao aceite integral das condições de uso de cookies, sem o fornecimento de opções efetivas ao titular" | VERIFIED |
| 25 | Pre-ticked boxes and consent by scrolling | consentimento | "não é recomendável a utilização de banners de cookies com opções de autorização pré-selecionadas ou a adoção de mecanismos de consentimento tácito, como a pressuposição de que, ao continuar a navegação em uma página, o titular forneceria consentimento" | VERIFIED |
| 26 | Withdrawal as easy as giving | consentimento | "deve ser disponibilizado ao titular um procedimento simplificado e gratuito para revogar o consentimento fornecido para a utilização de cookies, de forma similar ao procedimento utilizado para obtê-lo" | VERIFIED |
| 27 | Proof and records | consentimento | "compete ao controlador a responsabilidade de comprovar que o consentimento foi obtido com respeito a todos os parâmetros estabelecidos pela lgpd. Dessa forma, é uma boa prática o registro e a documentação de todos os requisitos necessários" | VERIFIED |
| 28 | Reject button on first layer | Banners de cookies, banners de primeiro nível | "Disponibilizar botão que permita rejeitar todos os cookies não necessários, de fácil visualização, nos banners de primeiro e segundo nível." | VERIFIED |
| 29 | Reject as prominent as accept | O que evitar | "Dificultar a visualização ou compreensão dos botões de rejeitar cookies ou de configurar cookies, e conferir maior destaque apenas ao botão de aceite" | VERIFIED |
| 30 | Single accept button | O que evitar | "Utilizar um único botão no banner de primeiro nível, sem opção de gerenciamento no caso de utilizar a hipótese legal do consentimento" | VERIFIED |
| 31 | Off by default | banners de segundo nível; O que evitar | "Desativar cookies baseados no consentimento por padrão." and, to avoid: "Apresentar cookies não necessários ativados por padrão, exigindo a desativação manual pelo titular" | VERIFIED |
| 32 | Per-purpose consent | banners de segundo nível | "Permitir a obtenção do consentimento para cada finalidade específica, de acordo com as categorias identificadas no banner de segundo nível, quando couber" | VERIFIED |
| 33 | Retention must fit purpose | Cookies e a LGPD, (iv) | "períodos de retenção indeterminados, excessivos ou desproporcionais em relação às finalidades do tratamento não são compatíveis com a lgpd" | VERIFIED |
| 34 | Persistent cookies | Categorias, item i | "é recomendável limitar sua duração no tempo, tanto quanto possível" | VERIFIED |
| 35 | Changed premises need new consent | consentimento | "Qualquer alteração das premissas adotadas para a obtenção do consentimento macula a hipótese legal adotada, exigindo novo consentimento pelo titular de dados" | VERIFIED |

URL for all rows: the ANPD PDF URL above.

Points the guide does not settle (I searched the full text for IP, criança, adolescente, prazo, meses, renov, expir):
- A fixed consent expiry or re-consent interval: not found in a primary source. UNVERIFIED. Rows 33 to 35 are the closest text and give no number.
- IP address as personal data: not found in the guide. UNVERIFIED.
- Children in the cookie context: not found in the guide. The only primary text is LGPD Art. 14 (rows 12 and 13).
- ANPD Enunciado CD/ANPD nº 1/2023 on children and adolescents: law firm pages reported it (best interest under Art. 14, bases of Art. 7 or 11 allowed). I did not open the ANPD page for it. UNVERIFIED.
- Legal-basis wording for rejecting: the guide uses "Rejeitar cookies não necessários" in its banner examples (Exemplo 6). This is an example wording, not a mandate.

## Part 2. What consent tools ship for Brazil

Only the vendor's own pages count. Where a vendor page was blocked (HTTP 403 or 404), needed a login, or was seen only as a search-result summary, every field is UNVERIFIED.

| Vendor | Model for Brazil | Reject on first layer | Default categories | Default expiry | IP stored | URL |
|---|---|---|---|---|---|---|
| iubenda | Opt-in. Page: "cookies based on consent must be disabled by default" and "Pre-ticked boxes are not allowed". VERIFIED (this is iubenda's description of the LGPD setting) | Yes. Page: reject button "must be easily visible both in the first and second layers"; accept and reject must have equal prominence. VERIFIED | Per-category consent, cookies grouped per category. Category names not stated. UNVERIFIED names | Brazil-specific: UNVERIFIED. Generic parameter `expireAfter` default 365 days (help 1205). VERIFIED but not Brazil-specific | UNVERIFIED | https://www.iubenda.com/en/help/104366-brazil-new-cookie-requirements/ ; https://www.iubenda.com/en/help/1205 |
| Cookiebot (Usercentrics) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | support pages returned 403; `https://www.cookiebot.com/en/lgpd-compliance/` returned 404 |
| Usercentrics | Product default UNVERIFIED. The LGPD checklist (guidance, not a product default) says "Ensure that no cookies are loaded until users have given consent". VERIFIED as guidance | Checklist: "Equal presentation and accessibility of “Accept” and “Reject” buttons". VERIFIED as guidance. Product default UNVERIFIED | UNVERIFIED | UNVERIFIED | Checklist lists "IP address" as data linked to a user. Whether the product stores it: UNVERIFIED | https://usercentrics.com/resources/lgpd-checklist/ ; setup article returned 403 |
| OneTrust | UNVERIFIED. A search-result summary of the LGPD Fast Track guide says the Brazil geolocation rule is opt-in by default. I could not open the page (login wall, empty body) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | https://my.onetrust.com/s/article/UUID-e1ea0e3e-0e7f-7523-37c1-4d80480af8e3?language=en_US |
| Termly | UNVERIFIED. Search summary says Termly has a Brazil region setting. Page returned 403 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | https://support.termly.io/hc/en-us/articles/37407494612881-Configuring-the-consent-banner-based-on-user-region |
| Osano | UNVERIFIED. Search summary says dialogs adapt to the visitor's country. The docs page returned 404 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | https://docs.osano.com/hc/en-us/articles/22472143434260-GDPR-CCPA-and-Brazil-s-LGPD (404 when fetched) |
| Klaro (open source) | No Brazil logic. Per-service `default: false` ("Defines the default state for services in the consent modal (true=enabled by default)"). VERIFIED | Config `hideDeclineAll: false`, described as hiding "the "decline" button in the consent modal". Whether decline shows in the first-layer notice: UNVERIFIED | Defined by the integrator. No default set. | `cookieExpiresAfterDays: 30`, with `storageMethod` cookie. VERIFIED | UNVERIFIED (client-side library, no server log in the config doc) | https://klaro.org/docs/integration/annotated-configuration |
| CookieConsent by orestbida v3.1.0 (open source) | No Brazil logic. `mode` default `'opt-in'`. VERIFIED | UNVERIFIED (button layout is integrator config) | Defined by the integrator. No default set. | `cookie.expiresAfterDays: 182`. VERIFIED | UNVERIFIED | https://cookieconsent.orestbida.com/reference/configuration-reference.html |
| CookieChimp (extra, not requested) | Opt-in. Page lists "Consent Lifespan 6 months". Reject "All Or Link" listed as mandatory banner element. VERIFIED as the vendor's own description | Yes, per the same page | "Purpose granularity required" | 6 months | Page says it does not address IP | https://cookiechimp.com/guides/regulations/br_lgpd |

Search results also cited a "6 months" lifespan and "18 months" retention for Brazil on third-party sites. No primary source supports either. They are excluded from the facts below.

## Part 3. Synthesis

### (a) Facts with sources

Everything in the VERIFIED rows of Part 1 and Part 2. The ones that drive the preset:

1. Consent must be free, informed, unequivocal and for a determined purpose (LGPD Art. 5, XII; Art. 8, § 4º).
2. The controller bears the burden of proof (LGPD Art. 8, § 2º).
3. Withdrawal must be free and easy (LGPD Art. 8, § 5º; ANPD guide: same ease as giving it).
4. ANPD says consent is more appropriate for non-necessary cookies, legitimate interest may fit strictly necessary and some analytics cookies, and legitimate interest rarely fits advertising cookies.
5. ANPD does not recommend pre-selected options or tacit consent by continued browsing.
6. ANPD recommends a first-layer button to reject all non-necessary cookies and warns against giving accept more prominence.
7. ANPD recommends consent-based cookies off by default and per-category consent in the second layer.
8. ANPD recommends records proving consent, and retention limited to the purpose. It gives no number.
9. Neither source gives a consent expiry period.
10. Open-source defaults: Klaro 30 days, CookieConsent 182 days. iubenda generic default 365 days.

### (b) Inferences (mine, not stated in any source)

- Inference: opt-in with a reject button on the first layer is the safest default. It satisfies every ANPD recommendation read above. An opt-out default would contradict row 31 for any non-necessary category.
- Inference: the guide allows analytics under legitimate interest, so an opt-out or no-banner mode for analytics-only sites is possible. The guide's conditions (aggregation, no profiling, no combination, opposition option) are not something this backend can check. A default preset cannot assume them. Offer it as a separate preset, not the default.
- Inference: because ANPD gives no expiry and says retention must fit purpose, any number is a product choice. Brazil is not stricter than the Europe preset's 365 days on any source I read, but the 182-day figure in CookieConsent and the 6-month figure at CookieChimp make a shorter value defensible.
- Inference: GPC (`gpc`) has no Brazilian source in my reading. The preset should leave it off.
- Inference: IP is likely personal data under Art. 5, I when it can identify a visitor, but I found no primary statement. Storing it as proof is defensible under rows 6 and 27, and it is also a data minimisation question under the necessity principle the guide cites (Art. 6, II).
- Inference: the guide's category list (analytical, functionality, advertising, plus necessary) maps onto the backend's `necessary`, `functionality`, `measurement`, `marketing`. The `experience` category has no counterpart in the guide.

### (c) Proposed preset

Proposed ID: `brazil_opt_in`. Match: country `BR` (no region split found in either source).

Tags: law-required (L), regulator-recommended (R), common-industry-practice (I), my-choice (M).

| Field | Value | Tag | Reason |
|---|---|---|---|
| `match.countries` | `["BR"]` | M | LGPD applies by processing context, not by a regional list. Country match is how the other presets scope. |
| `consent.model` | `opt-in` | R | ANPD: consent suits non-necessary cookies, off by default. Not L because the LGPD names no cookie rule and allows other bases (Art. 7). |
| `consent.expiryDays` | `180` | M | No period in the LGPD or the guide. Chosen near CookieConsent's 182 and CookieChimp's 6 months. The guide asks for the shortest practical duration. Needs a lawyer. |
| `consent.scopeMode` | `strict` | M | Supports purpose-bound consent (LGPD Art. 8, § 4º) by rejecting writes for categories outside the policy. |
| `consent.categories` | `necessary`, `functionality`, `measurement`, `marketing` | R | Mirrors the guide's necessary, functionality, analytical and advertising categories. `experience` left out because the guide has no such category. |
| `consent.preselectedCategories` | `[]` | R | ANPD: no pre-selected options. `necessary` stays always on in the backend. |
| `consent.gpc` | `false` | M | No Brazilian source recognises GPC. |
| `ui.mode` | `banner` | I | The guide describes banners as the common mechanism but does not mandate one. |
| `ui.banner.allowedActions`, `ui.dialog.allowedActions` | `accept`, `reject`, `customize` | R | ANPD's first-layer example has reject, accept and manage. |
| `ui.*.layout` | reject and accept on one row, customize below (same as `splitRowSurface()`) | R | ANPD warns against giving accept more prominence. I did not read how `primaryActions` renders. Check that accept is not visually dominant. |
| `proof.storeIp` | `true` | M | Supports proof of consent (Art. 8, § 2º). Legal status of IP: UNVERIFIED. Lawyer question 3. |
| `proof.storeUserAgent` | `true` | M | Same reason. |
| `proof.storeLanguage` | `true` | R | The guide lists a cookie policy in a foreign language only as a practice to avoid. Storing the notice language helps prove what was shown. |

Mapped to existing presets: this is `PresetQuebec()` with a different ID, match and expiry, plus `scopeMode` and `categories`. Nothing in `policy.go` needs to change.

### Open questions for a Brazilian lawyer

1. Is there any binding consent validity period, or any ANPD position, beyond the guide? Is 180 days acceptable, or should it be shorter or longer?
2. Does the ANPD guide create enforceable duties, or only good practice? Has ANPD sanctioned a cookie banner since October 2022?
3. Is an IP address personal data under Art. 5, I in this context? Is storing it as consent proof proportionate, and for how long?
4. May analytics run under legitimate interest with no banner? What conditions must the operator document?
5. Does ANPD Enunciado CD/ANPD nº 1/2023 change how consent must be collected from minors, and does a site need age screening?
6. Does the Marco Civil da Internet (Lei 12.965/2014) set a retention duty for access logs that affects what the consent record may hold?
7. Is a legal-document-release proof (as this backend already requires) sufficient as burden-of-proof evidence under Art. 8, § 2º?
8. When a cookie policy changes, which changes count under Art. 8, § 6º as requiring new consent?
