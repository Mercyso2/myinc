# Publicar a atualização no GitHub

Este workspace já contém os commits locais da versão estável do **MYINC Social Media AI**, mas a atualização só aparece no GitHub quando existe um remote configurado e um push é feito para o repositório remoto.

## 1. Testar conexão

Execute:

```bash
bun run github:check
```

O script valida:

- acesso HTTP a `github.com`;
- branch atual;
- commit local;
- remote `origin`;
- acesso ao repositório remoto via `git ls-remote`;
- presença e autenticação do GitHub CLI (`gh`), quando disponível.

## 2. Configurar remote se ainda não existir

Use **um** dos formatos abaixo, trocando `OWNER/REPO` pelo repositório real:

```bash
git remote add origin git@github.com:OWNER/REPO.git
```

ou:

```bash
git remote add origin https://github.com/OWNER/REPO.git
```

Depois confirme:

```bash
git remote -v
```

## 3. Enviar a branch atual

```bash
git push -u origin HEAD
```

## 4. Publicar a tag estável

```bash
git tag v1.0.0-stable
git push origin v1.0.0-stable
```

## 5. Criar o GitHub Release

No GitHub, crie um release para a tag `v1.0.0-stable` e use o conteúdo de `CHANGELOG.md` como release notes.

## Diagnóstico atual esperado quando não aparece no GitHub

Se o comando mostrar `Remote origin configurado: Nenhum remote origin configurado`, então o GitHub ainda não recebeu nada. Nesse caso, o problema não é a aplicação; falta conectar este workspace ao repositório remoto e executar o push.
