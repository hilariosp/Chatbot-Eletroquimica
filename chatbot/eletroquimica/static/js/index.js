document.addEventListener('DOMContentLoaded', function() {
    // Animação de scroll suave para links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Efeito de hover nos cards
    const cards = document.querySelectorAll('.card-custom');
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-5px)';
            card.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.3)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.boxShadow = '';
        });
    });

    // Adiciona classe de animação quando elementos entram na viewport
    const animateOnScroll = () => {
        const elements = document.querySelectorAll('.card-custom, .feature-icon, h2, h3');
        
        elements.forEach((element, index) => {
            const elementPosition = element.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.3;
            
            if (elementPosition < screenPosition) {
                element.classList.add('animate-fade');
                element.classList.add(`delay-${(index % 3) + 1}`);
            }
        });
    };

    // Verifica na carga inicial e no scroll
    window.addEventListener('scroll', animateOnScroll);
    animateOnScroll();
});