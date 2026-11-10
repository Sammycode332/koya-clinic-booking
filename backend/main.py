from fastapi import FastAPI


app = FastAPI(title = "clinic Booking API")

@app.get("/")
def home():
    return {"message": "Clinic Booking API is running"}


