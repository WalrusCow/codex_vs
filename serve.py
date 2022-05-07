import http.server, ssl
import signal
from threading import Thread

server_address = ('0.0.0.0', 8000)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)
httpd.socket = ssl.wrap_socket(httpd.socket,
                               server_side=True,
                               certfile='localhost.pem',
                               ssl_version=ssl.PROTOCOL_TLS)
thread = Thread(target=lambda: httpd.serve_forever())
thread.start()
signal.signal(signal.SIGINT, lambda sig, frame: httpd.shutdown())
print(f'Now listening on :{httpd.server_port}')
thread.join()
print(f'Server stopped')
