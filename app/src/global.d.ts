// Tipagem das chaves de tradução a partir do pt.json (fonte da verdade) —
// pega erro de digitação em t("namespace.chave") em tempo de compilação,
// importante dado o volume de arquivos migrados pro next-intl de uma vez.
type Messages = typeof import("../messages/pt.json")

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- padrão oficial do next-intl pra tipar useTranslations()/getTranslations() via declaration merging
declare interface IntlMessages extends Messages {}
