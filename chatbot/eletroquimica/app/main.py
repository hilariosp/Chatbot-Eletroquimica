from flask import Blueprint, render_template
import os

main_bp = Blueprint(
    'main',
    __name__,
    template_folder=os.path.join(os.path.dirname(__file__), '..', 'templates'),
    static_folder=os.path.join(os.path.dirname(__file__), '..', 'static'),
    static_url_path='/static'  
)

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/chatbot')
def chatbot():
    return render_template('chatbot.html')

@main_bp.route('/contato')
def contato():
    return render_template('contato.html')

@main_bp.route('/recursos')
def recursos():
    return render_template('recursos.html')

@main_bp.route('/sobre')
def sobre():
    return render_template('sobre.html')