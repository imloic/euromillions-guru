FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 555 /usr/share/nginx/html
EXPOSE 80
