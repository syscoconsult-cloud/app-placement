FROM python:3.12-slim
WORKDIR /appli
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY echeances.py ./
COPY app ./app
ENV DATABASE=/donnees/echeances.sqlite3
VOLUME /donnees
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "app:create_app()"]
