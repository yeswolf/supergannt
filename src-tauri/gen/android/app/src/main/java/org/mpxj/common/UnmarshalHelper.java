/*
 * Patched copy of org.mpxj.common.UnmarshalHelper (MPXJ 16.5.0, LGPL-2.1).
 * Android's SAXParserFactory.newInstance() always returns Harmony, which rejects
 * Apache feature http://apache.org/xml/features/disallow-doctype-decl.
 * Prefer Xerces when on the classpath; otherwise skip unsupported features.
 */
package org.mpxj.common;

import java.io.IOException;
import java.io.InputStream;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.JAXBException;
import jakarta.xml.bind.Unmarshaller;
import jakarta.xml.bind.UnmarshallerHandler;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.SAXParserFactory;
import javax.xml.transform.sax.SAXSource;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXNotRecognizedException;
import org.xml.sax.SAXNotSupportedException;
import org.xml.sax.XMLFilter;
import org.xml.sax.XMLReader;

public final class UnmarshalHelper {
  private UnmarshalHelper() {}

  public static final Object unmarshal(JAXBContext context, InputStream stream)
      throws JAXBException, SAXException, ParserConfigurationException {
    return context
        .createUnmarshaller()
        .unmarshal(new SAXSource(createXmlReader(), new InputSource(stream)));
  }

  public static final Object unmarshal(JAXBContext context, InputStream stream, XMLFilter filter)
      throws JAXBException, SAXException, ParserConfigurationException, IOException {
    return unmarshal(context, new InputSource(stream), filter, false);
  }

  public static final Object unmarshal(
      JAXBContext context, InputSource source, XMLFilter filter, boolean ignoreValidationErrors)
      throws JAXBException, SAXException, ParserConfigurationException, IOException {
    Unmarshaller unmarshaller = context.createUnmarshaller();
    if (ignoreValidationErrors) {
      unmarshaller.setEventHandler(event -> true);
    }
    UnmarshallerHandler unmarshallerHandler = unmarshaller.getUnmarshallerHandler();
    filter.setParent(createXmlReader());
    filter.setContentHandler(unmarshallerHandler);
    filter.parse(source);
    return unmarshallerHandler.getResult();
  }

  public static final XMLReader createXmlReader() throws SAXException, ParserConfigurationException {
    SAXParserFactory factory = newSaxFactory();
    setFeatureQuietly(factory, DISALLOW_DOCTYPE_DECL, true);
    factory.setNamespaceAware(true);
    return factory.newSAXParser().getXMLReader();
  }

  public static DocumentBuilder createDocumentBuilder() throws ParserConfigurationException {
    DocumentBuilderFactory factory = newDocumentFactory();
    try {
      factory.setFeature(DISALLOW_DOCTYPE_DECL, true);
    } catch (ParserConfigurationException ignored) {
      // Harmony on Android
    }
    return factory.newDocumentBuilder();
  }

  private static SAXParserFactory newSaxFactory() {
    try {
      return (SAXParserFactory)
          Class.forName("org.apache.xerces.jaxp.SAXParserFactoryImpl")
              .getDeclaredConstructor()
              .newInstance();
    } catch (ReflectiveOperationException e) {
      return SAXParserFactory.newInstance();
    }
  }

  private static DocumentBuilderFactory newDocumentFactory() {
    try {
      return (DocumentBuilderFactory)
          Class.forName("org.apache.xerces.jaxp.DocumentBuilderFactoryImpl")
              .getDeclaredConstructor()
              .newInstance();
    } catch (ReflectiveOperationException e) {
      return DocumentBuilderFactory.newInstance();
    }
  }

  private static void setFeatureQuietly(SAXParserFactory factory, String name, boolean value) {
    try {
      factory.setFeature(name, value);
    } catch (SAXNotRecognizedException
        | SAXNotSupportedException
        | ParserConfigurationException ignored) {
      // Android Harmony SAX / unexpected factory
    }
  }

  private static final String DISALLOW_DOCTYPE_DECL =
      "http://apache.org/xml/features/disallow-doctype-decl";
}
