document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            if(this.getAttribute('href') !== '#') {
                e.preventDefault();
                document.querySelector(this.getAttribute('href')).scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

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

    const animateOnScroll = () => {
        const elements = document.querySelectorAll('.card-custom, h2, h3, h5, .hero-section h1, .hero-section p, .row.align-items-center > div');

        elements.forEach((element, index) => {
            const elementPosition = element.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.3;

            if(elementPosition < screenPosition) {
                element.classList.add('animate-fade');
                if(index > 1) {
                    element.classList.add(`delay-${(index % 3) + 1}`);
                }
            }
        });
    };

    window.addEventListener('scroll', animateOnScroll);
    animateOnScroll();
});