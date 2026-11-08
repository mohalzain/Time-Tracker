from flask import Flask
from flask import request

app = Flask('task')



@app.route('/',methods=['GET'])
def main(name):
    return name


app.run()

