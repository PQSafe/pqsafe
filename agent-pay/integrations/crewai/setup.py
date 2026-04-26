"""
setup.py for crewai-pqsafe.

pip install -e .
"""

from setuptools import setup, find_packages

setup(
    name="crewai-pqsafe",
    version="0.1.0",
    description="CrewAI integration for PQSafe AgentPay — post-quantum safe payments for AI crews",
    long_description=open("README.md", encoding="utf-8").read(),
    long_description_content_type="text/markdown",
    author="PQSafe",
    author_email="dev@pqsafe.xyz",
    url="https://pqsafe.xyz",
    project_urls={
        "Documentation": "https://docs.pqsafe.xyz",
        "Repository": "https://github.com/PQSafe/pqsafe",
    },
    license="MIT",
    packages=find_packages(exclude=["tests*", "examples*"]),
    python_requires=">=3.10",
    install_requires=[
        "crewai>=0.30.0",
        "pydantic>=2.0.0",
    ],
    extras_require={
        "http": ["requests>=2.31.0"],
        "dev": [
            "pytest>=7.4",
            "pytest-mock>=3.12",
            "requests>=2.31.0",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries",
    ],
    keywords=["crewai", "pqsafe", "payments", "ai-agents", "post-quantum", "ml-dsa"],
)
