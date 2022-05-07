echo Access the dev site at https://$(ifconfig eth0 | rg -o 'inet (\S+)' -r '$1'):8000
npx babel src --out-dir site --watch &
python serve.py
