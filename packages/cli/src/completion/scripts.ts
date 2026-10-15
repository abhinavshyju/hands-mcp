/** Bash completion script for `hands`. */
export function bashCompletionScript(handsBin = "hands"): string {
  return `# hands shell completion (bash)
_hands_completion() {
  local cur prev words cword
  _init_completion -n : || return
  local suggestions
  suggestions=$("${handsBin}" __complete --cword "$COMP_CWORD" -- \${COMP_WORDS[@]})
  if [[ $? -ne 0 ]]; then
    return
  fi
  COMPREPLY=( $(compgen -W "$suggestions" -- "$cur") )
}
complete -F _hands_completion ${handsBin}
`;
}

/** Zsh completion script for `hands`. */
export function zshCompletionScript(handsBin = "hands"): string {
  return `#compdef ${handsBin}
_hands() {
  local -a suggestions
  suggestions=(\`${handsBin} __complete --cword \${CURRENT} -- \${words[@]}\`)
  compadd -a suggestions
}
compdef _hands ${handsBin}
`;
}

/** Fish completion script for `hands`. */
export function fishCompletionScript(handsBin = "hands"): string {
  return `function __hands_complete
  set -l tokens (commandline -opc)
  set -l cursor (commandline -C)
  set -l cword (count $tokens)
  if test -n "$cursor" -a "$cursor" != "$tokens[-1]"
    set cword (math $cword + 1)
  end
  ${handsBin} __complete --cword $cword -- $tokens
end
complete -c ${handsBin} -f -a "(__hands_complete)"
`;
}
