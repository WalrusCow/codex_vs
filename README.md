# When is Codex the right choice?

This is a script that looks at a log and tries to say if Codex did good damage,
compared to what a passive dps trinket with strength would do.

Hosted on Github pages: https://walruscow.github.io/codex_vs/

# Developing

This project was developed in Ubuntu WSL2. ymmv on other systems.

First, generate an ssl cert to use during development
```
# make an ssl cert. we need to use ssl to access crypto functions
# this only needs to be done once
$ openssl req -new -x509 -keyout localhost.pem -out localhost.pem -days 365 -nodes
```

Now start babel and the local web server
```
npm run dev
```

When running under wsl, access the app at
```
echo $(ifconfig eth0 | rg -o 'inet (\S+)' -r '$1'):8000
```
