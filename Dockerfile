FROM nginx:1.29-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/site.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY public/ /usr/share/nginx/html/
# Précompression au build : nginx (gzip_static) sert les .gz tels quels.
# Les JSON ne changent que 2x/semaine -> compresser au build, pas au runtime.
RUN find /usr/share/nginx/html -type f \( -name '*.json' -o -name '*.html' -o -name '*.svg' -o -name '*.xml' -o -name '*.txt' \) -exec gzip -9k {} \; && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 555 /usr/share/nginx/html
EXPOSE 80
