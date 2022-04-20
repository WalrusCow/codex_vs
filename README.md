# Is Codex any good?

This is a script that looks at a log and tries to say if Codex did good damage, compared to wearing a strength trinket

```
$ python main.py codex AxQzK6fZHdT1y2wD --fight 1 --player Demorgan
Codex damage: 528678
Strength damage: 439900
Effective codex damage: 88778
Effective codex dps: 49.4
Effective codex dps (combat): 62.2
```

Currently rewriting it as a JS app to run on GH pages

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
